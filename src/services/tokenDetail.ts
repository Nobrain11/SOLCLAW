/**
 * Live token detail: chart, trades, holders, liquidity.
 * Sources: DexScreener + GeckoTerminal + pump.fun (+ optional Solana Tracker).
 * No mock fills in production payloads.
 */

import { resolveSparkline, resolveTokenImage } from './tokenMeta.js';
import { getMarketData } from './market.js';
import { scanToken } from './scanner.js';
import {
  getTokenOverview,
  getRecentTrades,
  getTokenSafetyStats,
  getChartEmbedUrl,
  type RecentTrade,
} from './marketData.js';

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

export type SafetyBreakdown = {
  top10HolderPct: number | null;
  devHoldPct: number | null;
  snipersHoldPct: number | null;
  insidersPct: number | null;
  bundlersPct: number | null;
  lpBurnedPct: number | null;
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
  change5m: number | null;
  change6h: number | null;
  buys: number | null;
  sells: number | null;
  pairAddress: string | null;
  dexId: string | null;
  onCurve: boolean;
  holderCount: number | null;
  holders: HolderRow[];
  trades: LiveTrade[];
  sparkline: number[];
  chartEmbedUrl: string | null;
  safety: SafetyBreakdown;
  safetyLevel: string;
  warnings: string[];
  updatedAt: number;
};

function short(a: string | null | undefined): string | null {
  if (!a || a.length < 8) return a ?? null;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function saneUsd(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n > 5_000_000_000) return null;
  return n;
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

function mapGeckoTrades(rows: RecentTrade[]): LiveTrade[] {
  return rows.map((t) => ({
    type: t.type,
    sol: t.amountSol,
    usd: t.amountUsd,
    price: t.priceUsd,
    wallet: short(t.trader),
    ts: t.timestamp,
    signature: t.txHash ?? undefined,
  }));
}

export async function getTokenDetail(mint: string): Promise<TokenDetail> {
  const [market, analysis, pump, overview, safety] = await Promise.all([
    getMarketData(mint).catch(() => null),
    scanToken(mint).catch(() => null),
    loadPump(mint),
    getTokenOverview(mint).catch(() => null),
    getTokenSafetyStats(mint).catch(() => ({
      top10HolderPct: null,
      devHoldPct: null,
      snipersHoldPct: null,
      insidersPct: null,
      bundlersPct: null,
      lpBurnedPct: null,
    })),
  ]);

  const pairAddress = overview?.pairAddress ?? null;

  let liveTrades: LiveTrade[] = [];
  if (pairAddress) {
    try {
      const gecko = await getRecentTrades(pairAddress);
      liveTrades = mapGeckoTrades(gecko);
    } catch {
      liveTrades = [];
    }
  }

  const price =
    overview?.priceUsd ??
    market?.priceUsd ??
    analysis?.price ??
    (typeof pump?.price_usd === 'number' ? pump.price_usd : null) ??
    null;

  const change24h =
    overview?.change24h ?? market?.priceChange24h ?? analysis?.priceChange24h ?? null;

  const sparkline = await resolveSparkline(mint, change24h, price);
  const tradePrices = liveTrades
    .map((t) => t.price)
    .filter((p): p is number => p != null && p > 0)
    .reverse();
  const chart = tradePrices.length >= 4 ? tradePrices.slice(-32) : sparkline;

  const image =
    overview?.iconUrl ??
    (await resolveTokenImage(
      mint,
      pump?.image_uri ? String(pump.image_uri) : null
    )) ??
    null;

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
  const chartEmbedUrl = pairAddress ? getChartEmbedUrl(pairAddress, 'dexscreener') : null;

  return {
    mint,
    name:
      overview?.name ||
      analysis?.name ||
      String(pump?.name || '') ||
      mint.slice(0, 8),
    symbol:
      overview?.symbol ||
      analysis?.symbol ||
      String(pump?.symbol || '') ||
      'TOKEN',
    image,
    priceUsd: price,
    marketCap: saneUsd(
      overview?.marketCap ??
        market?.marketCap ??
        (typeof pump?.usd_market_cap === 'number' ? pump.usd_market_cap : null) ??
        analysis?.marketCap ??
        null
    ),
    liquidity: saneUsd(
      overview?.liquidity ?? market?.liquidityUsd ?? analysis?.liquidity ?? null
    ),
    volume24h: saneUsd(overview?.volume24h ?? market?.volume24h ?? null),
    volume1h: saneUsd(overview?.volume1h ?? null),
    change24h,
    change1h: overview?.change1h ?? null,
    change5m: overview?.change5m ?? null,
    change6h: overview?.change6h ?? null,
    buys: overview?.buys24h ?? null,
    sells: overview?.sells24h ?? null,
    pairAddress,
    dexId: market?.dexId ?? null,
    onCurve,
    holderCount,
    holders,
    trades: liveTrades,
    sparkline: chart,
    chartEmbedUrl,
    safety: {
      top10HolderPct: safety.top10HolderPct,
      devHoldPct: safety.devHoldPct,
      snipersHoldPct: safety.snipersHoldPct,
      insidersPct: safety.insidersPct,
      bundlersPct: safety.bundlersPct,
      lpBurnedPct: safety.lpBurnedPct,
    },
    safetyLevel: analysis?.safetyLevel ?? 'UNKNOWN',
    warnings: analysis?.warnings ?? [],
    updatedAt: Date.now(),
  };
}
