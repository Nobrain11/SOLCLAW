/**
 * Free-tier market data: DexScreener + GeckoTerminal (+ optional Solana Tracker).
 * Heavy caching to survive rate limits. No paid keys required.
 */

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex';
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2/networks/solana';
const SOLANA_TRACKER_BASE = 'https://data.solanatracker.io';

const UA = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

type CacheEntry<T> = { at: number; data: T };
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, maxAgeMs: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.data as T;
}

function setCache<T>(key: string, data: T): T {
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function fetchJson(url: string, ms = 10_000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: UA,
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type TrendingPool = {
  pairAddress: string;
  mint: string | null;
  name: string;
  symbol: string;
  priceUsd: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  createdAt: string | null;
  image: string | null;
};

export type TokenOverview = {
  source: string;
  pairAddress: string | null;
  mint: string | null;
  name: string | null;
  symbol: string | null;
  iconUrl: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidity: number | null;
  change5m: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  volume24h: number | null;
  volume1h: number | null;
  buys24h: number | null;
  sells24h: number | null;
};

export type RecentTrade = {
  type: 'BUY' | 'SELL';
  amountUsd: number | null;
  amountSol: number | null;
  trader: string | null;
  priceUsd: number | null;
  txHash: string | null;
  timestamp: number;
};

export type SafetyStats = {
  top10HolderPct: number | null;
  devHoldPct: number | null;
  snipersHoldPct: number | null;
  insidersPct: number | null;
  bundlersPct: number | null;
  lpBurnedPct: number | null;
};

/** GeckoTerminal trending pools (Solana) — free, no key */
export async function getTrendingPools(page = 1): Promise<TrendingPool[]> {
  const key = `gt:trend:${page}`;
  const cached = getCached<TrendingPool[]>(key, 25_000);
  if (cached) return cached;

  const j = await fetchJson(`${GECKO_BASE}/trending_pools?page=${page}`);
  if (!j || typeof j !== 'object') return getCached<TrendingPool[]>(key, 120_000) ?? [];

  const rows = (j as { data?: unknown[] }).data ?? [];
  const out: TrendingPool[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const pool = raw as {
      attributes?: Record<string, unknown>;
      relationships?: {
        base_token?: { data?: { id?: string } };
      };
    };
    const a = pool.attributes ?? {};
    const baseId = pool.relationships?.base_token?.data?.id ?? '';
    const mint =
      typeof baseId === 'string' && baseId.includes('_')
        ? baseId.split('_').slice(1).join('_')
        : null;
    const nameStr = String(a.name ?? '');
    const symbol = nameStr.split('/')[0]?.trim() || '???';
    const pc = (a.price_change_percentage as Record<string, unknown>) || {};
    const vol = (a.volume_usd as Record<string, unknown>) || {};
    out.push({
      pairAddress: String(a.address ?? ''),
      mint,
      name: nameStr,
      symbol,
      priceUsd: num(a.base_token_price_usd),
      priceChange5m: num(pc.m5),
      priceChange1h: num(pc.h1),
      priceChange24h: num(pc.h24),
      marketCap: num(a.market_cap_usd) ?? num(a.fdv_usd),
      liquidity: num(a.reserve_in_usd),
      volume24h: num(vol.h24),
      createdAt: a.pool_created_at ? String(a.pool_created_at) : null,
      image: null,
    });
  }
  return setCache(key, out);
}

/** DexScreener primary overview by mint */
export async function getTokenOverview(
  tokenAddress: string
): Promise<TokenOverview | null> {
  const key = `ov:${tokenAddress}`;
  const cached = getCached<TokenOverview>(key, 20_000);
  if (cached) return cached;

  const j = await fetchJson(`${DEXSCREENER_BASE}/tokens/${tokenAddress}`);
  if (j && typeof j === 'object') {
    const pairs = ((j as { pairs?: Record<string, unknown>[] }).pairs ?? []).filter(
      (p) => String(p.chainId || '').toLowerCase() === 'solana'
    );
    pairs.sort(
      (a, b) =>
        Number((b.liquidity as { usd?: number })?.usd ?? 0) -
        Number((a.liquidity as { usd?: number })?.usd ?? 0)
    );
    const pair = pairs[0];
    if (pair) {
      const base = pair.baseToken as Record<string, unknown> | undefined;
      const info = pair.info as Record<string, unknown> | undefined;
      const pc = (pair.priceChange as Record<string, unknown>) || {};
      const vol = (pair.volume as Record<string, unknown>) || {};
      const tx = (pair.txns as Record<string, unknown>) || {};
      const h24 = (tx.h24 as Record<string, unknown>) || {};
      const overview: TokenOverview = {
        source: 'dexscreener',
        pairAddress: pair.pairAddress ? String(pair.pairAddress) : null,
        mint: tokenAddress,
        name: base?.name ? String(base.name) : null,
        symbol: base?.symbol ? String(base.symbol) : null,
        iconUrl: info?.imageUrl ? String(info.imageUrl) : null,
        priceUsd: num(pair.priceUsd),
        marketCap: num(pair.fdv) ?? num(pair.marketCap),
        liquidity: num((pair.liquidity as { usd?: number })?.usd),
        change5m: num(pc.m5),
        change1h: num(pc.h1),
        change6h: num(pc.h6),
        change24h: num(pc.h24),
        volume24h: num(vol.h24),
        volume1h: num(vol.h1),
        buys24h: num(h24.buys),
        sells24h: num(h24.sells),
      };
      return setCache(key, overview);
    }
  }

  const gt = await fetchJson(`${GECKO_BASE}/tokens/${tokenAddress}`);
  if (gt && typeof gt === 'object') {
    const attr = (gt as { data?: { attributes?: Record<string, unknown> } }).data
      ?.attributes;
    if (attr) {
      const vol = (attr.volume_usd as Record<string, unknown>) || {};
      const overview: TokenOverview = {
        source: 'geckoterminal',
        pairAddress: null,
        mint: tokenAddress,
        name: attr.name ? String(attr.name) : null,
        symbol: attr.symbol ? String(attr.symbol) : null,
        iconUrl: attr.image_url ? String(attr.image_url) : null,
        priceUsd: num(attr.price_usd),
        marketCap: num(attr.fdv_usd) ?? num(attr.market_cap_usd),
        liquidity: num(attr.total_reserve_in_usd),
        change5m: null,
        change1h: null,
        change6h: null,
        change24h: null,
        volume24h: num(vol.h24),
        volume1h: num(vol.h1),
        buys24h: null,
        sells24h: null,
      };
      return setCache(key, overview);
    }
  }

  return getCached<TokenOverview>(key, 120_000);
}

/** Live trades for a pool (GeckoTerminal) */
export async function getRecentTrades(
  poolAddress: string
): Promise<RecentTrade[]> {
  if (!poolAddress) return [];
  const key = `tr:${poolAddress}`;
  const cached = getCached<RecentTrade[]>(key, 8_000);
  if (cached) return cached;

  const j = await fetchJson(
    `${GECKO_BASE}/pools/${poolAddress}/trades?trade_volume_in_usd_greater_than=1`
  );
  if (!j || typeof j !== 'object') return getCached<RecentTrade[]>(key, 60_000) ?? [];

  const rows = (j as { data?: unknown[] }).data ?? [];
  const out: RecentTrade[] = [];
  for (const raw of rows.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const a = (raw as { attributes?: Record<string, unknown> }).attributes ?? {};
    const kind = String(a.kind || '').toLowerCase();
    const isBuy = kind === 'buy';
    const tsRaw = a.block_timestamp ? String(a.block_timestamp) : '';
    const ts = tsRaw ? Date.parse(tsRaw) : Date.now();
    out.push({
      type: isBuy ? 'BUY' : 'SELL',
      amountUsd: num(a.volume_in_usd),
      amountSol: num(a.from_token_amount),
      trader: a.tx_from_address ? String(a.tx_from_address) : null,
      priceUsd: num(a.price_to_in_usd) ?? num(a.price_from_in_usd),
      txHash: a.tx_hash ? String(a.tx_hash) : null,
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
    });
  }
  return setCache(key, out);
}

/** Optional Solana Tracker safety stats */
export async function getTokenSafetyStats(
  tokenAddress: string,
  apiKey: string | null = process.env.SOLANA_TRACKER_API_KEY || null
): Promise<SafetyStats> {
  const empty: SafetyStats = {
    top10HolderPct: null,
    devHoldPct: null,
    snipersHoldPct: null,
    insidersPct: null,
    bundlersPct: null,
    lpBurnedPct: null,
  };
  const key = `safe:${tokenAddress}`;
  const cached = getCached<SafetyStats>(key, 60_000);
  if (cached) return cached;

  try {
    const headers: Record<string, string> = { ...UA };
    if (apiKey) headers['x-api-key'] = apiKey;
    const res = await fetch(`${SOLANA_TRACKER_BASE}/tokens/${tokenAddress}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return setCache(key, empty);
    const data = (await res.json()) as {
      risk?: Record<string, number>;
      pools?: Array<{ lpBurn?: number }>;
    };
    const stats: SafetyStats = {
      top10HolderPct: data.risk?.top10 ?? null,
      devHoldPct: data.risk?.devHold ?? null,
      snipersHoldPct: data.risk?.snipersHold ?? null,
      insidersPct: data.risk?.insiders ?? null,
      bundlersPct: data.risk?.bundlers ?? null,
      lpBurnedPct: data.pools?.[0]?.lpBurn ?? null,
    };
    return setCache(key, stats);
  } catch {
    return setCache(key, empty);
  }
}

export function getChartEmbedUrl(
  pairAddress: string,
  provider: 'dexscreener' | 'geckoterminal' = 'dexscreener'
): string {
  if (!pairAddress) return '';
  if (provider === 'geckoterminal') {
    return `https://www.geckoterminal.com/solana/pools/${pairAddress}?embed=1&info=0&swaps=0&theme=dark`;
  }
  return `https://dexscreener.com/solana/${pairAddress}?embed=1&theme=dark&trades=0&info=0`;
}
