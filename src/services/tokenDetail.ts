/**
 * Live token detail: chart points, trades, holders, liquidity.
 * Sources: DexScreener + pump.fun. No mock fills in production payloads.
 */

import { resolveSparkline, resolveTokenImage } from './tokenMeta.js';
import { getMarketData } from './market.js';
import { scanToken } from './scanner.js';

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; SOLCLAW/1.0)',
  Origin: 'https://pump.fun',
  Referer: 'https://pump.fun/',
};

async function fetchJson(url: string, ms = 8_000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type LiveTrade = {
  type: 'BUY' | 'SELL';
  sol: number | null;
  usd: number | null;
  price: number | null;
  wallet: string | null;
  ts: number;
  signature?: string;
};

export type HolderRow = {
  address: string;
  pct: number | null;
  amount: number | null;
};

export type TokenDetail = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  volume1h: number | null;
  change24h: number | null;
  change1h: number | null;
  buys: number | null;
  sells: number | null;
  pairAddress: string | null;
  dexId: string | null;
  onCurve: boolean;
  holderCount: number | null;
  holders: HolderRow[];
  trades: LiveTrade[];
  sparkline: number[];
  safetyLevel: string;
  warnings: string[];
  updatedAt: number;
};

function short(a: string | null | undefined): string | null {
  if (!a || a.length < 8) return a ?? null;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

async function loadPump(mint: string) {
  for (const base of [
    'https://frontend-api-v3.pump.fun',
    'https://frontend-api.pump.fun',
  ]) {
    const j = await fetchJson(`${base}/coins/${mint}`, 7_000);
    if (j && typeof j === 'object') return j as Record<string, unknown>;
  }
  return null;
}

async function loadPumpTrades(mint: string): Promise<LiveTrade[]> {
  const urls = [
    `https://frontend-api-v3.pump.fun/trades/latest?mint=${mint}&limit=30`,
    `https://frontend-api-v3.pump.fun/coins/${mint}/trades?limit=30`,
  ];
  for (const url of urls) {
    const j = await fetchJson(url, 7_000);
    if (!j) continue;
    const rows = Array.isArray(j)
      ? j
      : Array.isArray((j as { trades?: unknown[] }).trades)
        ? (j as { trades: unknown[] }).trades
        : null;
    if (!rows?.length) continue;
    const out: LiveTrade[] = [];
    for (const r of rows.slice(0, 30)) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const isBuy =
        o.is_buy === true ||
        o.side === 'buy' ||
        String(o.type || '').toLowerCase() === 'buy';
      const sol = Number(o.sol_amount ?? o.solAmount ?? o.sol ?? NaN);
      const usd = Number(o.usd_amount ?? o.usdAmount ?? o.usd ?? NaN);
      const price = Number(o.price_usd ?? o.priceUsd ?? o.price ?? NaN);
      const ts = Number(
        o.timestamp ?? o.block_time ?? o.created_at ?? o.slot ?? Date.now()
      );
      const tsMs = ts > 1e12 ? ts : ts > 1e9 ? ts * 1000 : Date.now();
      out.push({
        type: isBuy ? 'BUY' : 'SELL',
        sol: Number.isFinite(sol) ? sol : null,
        usd: Number.isFinite(usd) ? usd : null,
        price: Number.isFinite(price) ? price : null,
        wallet: short(String(o.user ?? o.trader ?? o.wallet ?? o.owner ?? '')),
        ts: tsMs,
        signature: o.signature ? String(o.signature) : undefined,
      });
    }
    if (out.length) return out;
  }
  return [];
}

async function loadDexPair(mint: string) {
  const j = await fetchJson(
    `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
    8_000
  );
  if (!j || typeof j !== 'object') return null;
  const pairs = ((j as { pairs?: Record<string, unknown>[] }).pairs ?? []).filter(
    (p) => (p.chainId as string)?.toLowerCase() === 'solana'
  );
  if (!pairs.length) return null;
  pairs.sort(
    (a, b) =>
      Number((b.liquidity as { usd?: number })?.usd ?? 0) -
      Number((a.liquidity as { usd?: number })?.usd ?? 0)
  );
  return pairs[0];
}

export async function getTokenDetail(mint: string): Promise<TokenDetail> {
  const [market, analysis, pump, pair, trades] = await Promise.all([
    getMarketData(mint).catch(() => null),
    scanToken(mint).catch(() => null),
    loadPump(mint),
    loadDexPair(mint),
    loadPumpTrades(mint),
  ]);

  const txns = pair?.txns as
    | { h24?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number } }
    | undefined;
  const liq = pair?.liquidity as { usd?: number } | undefined;
  const vol = pair?.volume as { h24?: number; h1?: number } | undefined;
  const pc = pair?.priceChange as { h24?: number; h1?: number; m5?: number } | undefined;

  const priceUsd =
    market?.priceUsd ??
    (pair?.priceUsd != null ? Number(pair.priceUsd) : null) ??
    analysis?.price ??
    Number(pump?.price_usd ?? pump?.usd_price ?? NaN) ??
    null;

  const price =
    priceUsd != null && Number.isFinite(Number(priceUsd)) ? Number(priceUsd) : null;

  const change24h =
    market?.priceChange24h ?? pc?.h24 ?? analysis?.priceChange24h ?? null;

  const sparkline = await resolveSparkline(mint, change24h, price);
  const tradePrices = trades
    .map((t) => t.price)
    .filter((p): p is number => p != null && p > 0)
    .reverse();
  const chart = tradePrices.length >= 4 ? tradePrices.slice(-24) : sparkline;

  const image =
    (await resolveTokenImage(
      mint,
      pump?.image_uri ? String(pump.image_uri) : null
    )) ?? null;

  const holderCount =
    typeof pump?.holder_count === 'number'
      ? pump.holder_count
      : typeof pump?.holders === 'number'
        ? pump.holders
        : null;

  const holders: HolderRow[] = [];
  const rawHolders = pump?.top_holders ?? pump?.holders_list;
  if (Array.isArray(rawHolders)) {
    for (const h of rawHolders.slice(0, 12)) {
      if (!h || typeof h !== 'object') continue;
      const o = h as Record<string, unknown>;
      const addr = String(o.address ?? o.owner ?? o.wallet ?? '');
      if (!addr) continue;
      holders.push({
        address: short(addr) || addr,
        pct:
          typeof o.pct === 'number'
            ? o.pct
            : typeof o.percentage === 'number'
              ? o.percentage
              : null,
        amount:
          typeof o.amount === 'number'
            ? o.amount
            : typeof o.uiAmount === 'number'
              ? o.uiAmount
              : null,
      });
    }
  }

  const onCurve = pump ? pump.complete === false : false;

  return {
    mint,
    name:
      analysis?.name ||
      String(pump?.name || '') ||
      String((pair?.baseToken as { name?: string })?.name || '') ||
      mint.slice(0, 8),
    symbol:
      analysis?.symbol ||
      String(pump?.symbol || '') ||
      String((pair?.baseToken as { symbol?: string })?.symbol || '') ||
      'TOKEN',
    image,
    priceUsd: price,
    marketCap:
      market?.marketCap ??
      (typeof pair?.marketCap === 'number' ? pair.marketCap : null) ??
      (typeof pair?.fdv === 'number' ? pair.fdv : null) ??
      (typeof pump?.usd_market_cap === 'number' ? pump.usd_market_cap : null) ??
      analysis?.marketCap ??
      null,
    liquidity: market?.liquidityUsd ?? liq?.usd ?? analysis?.liquidity ?? null,
    volume24h: market?.volume24h ?? vol?.h24 ?? null,
    volume1h: vol?.h1 ?? null,
    change24h,
    change1h: pc?.h1 ?? null,
    buys: txns?.h1?.buys ?? txns?.h24?.buys ?? null,
    sells: txns?.h1?.sells ?? txns?.h24?.sells ?? null,
    pairAddress: pair?.pairAddress ? String(pair.pairAddress) : null,
    dexId: pair?.dexId ? String(pair.dexId) : market?.dexId ?? null,
    onCurve,
    holderCount,
    holders,
    trades,
    sparkline: chart,
    safetyLevel: analysis?.safetyLevel ?? 'UNKNOWN',
    warnings: analysis?.warnings ?? [],
    updatedAt: Date.now(),
  };
}
