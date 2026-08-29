/**
 * Live pump.fun coin scraper.
 * Trending = movers on curve. New pairs = newest created.
 */

export type TrendingToken = {
  mint: string;
  name: string;
  symbol: string;
  priceUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  liquidity: number | null;
  source: 'pump' | 'dex';
  url: string;
  createdAt?: number | null;
  image?: string | null;
  progressPct?: number | null;
};

const CACHE_MS = 15_000;
let cache: { at: number; items: TrendingToken[] } | null = null;

const HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://pump.fun',
  Referer: 'https://pump.fun/',
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapPumpCoin(c: Record<string, unknown>): TrendingToken | null {
  const mint = String(c.mint ?? c.address ?? '');
  if (!mint || mint.length < 32) return null;
  const mc =
    num(c.usd_market_cap) ?? num(c.market_cap) ?? num(c.marketCap) ?? null;
  const price =
    num(c.price_usd) ?? num(c.usd_price) ?? num(c.priceUsd) ?? null;
  const vol =
    num(c.volume_24h) ?? num(c.volume24h) ?? num(c.volume) ?? null;
  const img = String(c.image_uri ?? c.image ?? '');
  const solRes = num(c.virtual_sol_reserves);
  let progressPct: number | null = null;
  if (c.complete === true) progressPct = 100;
  else if (solRes != null && solRes > 0) {
    progressPct = Math.min(100, Math.round((solRes / 85) * 100));
  }
  const liq =
    num(c.virtual_usd_reserves) ??
    num(c.liquidity_usd) ??
    num(c.liquidityUsd) ??
    (typeof c.liquidity === 'number' && (c.liquidity as number) > 500
      ? num(c.liquidity)
      : null) ??
    (solRes != null ? solRes * 100 : null);
  return {
    mint,
    name: String(c.name ?? 'Unknown').slice(0, 28),
    symbol: String(c.symbol ?? '???').slice(0, 12),
    priceUsd: price,
    marketCap: mc,
    volume24h: vol,
    change24h: num(c.price_change_24h) ?? num(c.priceChange24h),
    liquidity: liq,
    progressPct,
    source: 'pump',
    url: `https://pump.fun/${mint}`,
    createdAt: num(c.created_timestamp) ?? num(c.createdAt),
    image: img.startsWith('http') ? img : null,
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPumpFun(limit = 24): Promise<TrendingToken[]> {
  const bases = [
    'https://frontend-api-v3.pump.fun',
    'https://frontend-api.pump.fun',
  ];
  const sorts = [
    'last_trade_timestamp',
    'created_timestamp',
    'market_cap',
    'virtual_sol_reserves',
  ];

  const seen = new Set<string>();
  const out: TrendingToken[] = [];

  for (const base of bases) {
    for (const sort of sorts) {
      if (out.length >= limit * 2) break;
      const url = `${base}/coins?offset=0&limit=${Math.min(limit * 2, 50)}&sort=${sort}&order=DESC&includeNsfw=false`;
      const data = await fetchJson(url);
      if (!Array.isArray(data)) continue;
      for (const raw of data) {
        const item = mapPumpCoin(raw as Record<string, unknown>);
        if (!item || seen.has(item.mint)) continue;
        seen.add(item.mint);
        out.push(item);
      }
    }
    if (out.length >= Math.min(10, limit)) break;
  }

  for (const base of bases) {
    const koth = await fetchJson(`${base}/coins/king-of-the-hill?includeNsfw=false`);
    if (koth && typeof koth === 'object') {
      const item = mapPumpCoin(koth as Record<string, unknown>);
      if (item && !seen.has(item.mint)) {
        seen.add(item.mint);
        out.unshift(item);
      }
    }
  }

  return out;
}

export async function getTrendingTokens(
  limit = 16,
  force = false
): Promise<TrendingToken[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.items.slice(0, limit);
  }

  // Pump.fun only for terminal feeds
  let items = await fetchPumpFun(Math.max(limit, 24));
  items = items.filter((i) => i.source === 'pump');

  items.sort((a, b) => {
    const score = (x: TrendingToken) =>
      (x.volume24h ?? 0) * 2 +
      (x.marketCap ?? 0) * 0.05 +
      (x.progressPct ?? 0) * 15 +
      Math.abs(x.change24h ?? 0) * 500;
    return score(b) - score(a);
  });

  items = items.slice(0, limit);
  cache = { at: Date.now(), items };
  return items;
}

/** Newest bonding-curve coins (Pulse / New pairs). */
export async function getNewPumpPairs(
  limit = 20,
  force = false
): Promise<TrendingToken[]> {
  const items = await getTrendingTokens(Math.max(limit * 2, 40), force);
  const pump = items.filter((i) => i.source === 'pump');
  pump.sort((a, b) => {
    const ta =
      a.createdAt != null
        ? a.createdAt > 1e12
          ? a.createdAt
          : a.createdAt * 1000
        : 0;
    const tb =
      b.createdAt != null
        ? b.createdAt > 1e12
          ? b.createdAt
          : b.createdAt * 1000
        : 0;
    return tb - ta;
  });
  return pump.slice(0, limit);
}

/** Pump.fun movers — volume / activity on curve. */
export async function getPumpMovers(
  limit = 20,
  force = false
): Promise<TrendingToken[]> {
  const items = await getTrendingTokens(Math.max(limit * 2, 40), force);
  const pump = items.filter((i) => i.source === 'pump');
  pump.sort((a, b) => {
    const score = (x: TrendingToken) =>
      (x.volume24h ?? 0) * 2 +
      (x.marketCap ?? 0) * 0.05 +
      Math.abs(x.change24h ?? 0) * 1000 +
      (x.progressPct ?? 0) * 10;
    return score(b) - score(a);
  });
  return pump.slice(0, limit);
}

export function formatTrendingMessage(items: TrendingToken[]): string {
  if (!items.length) {
    return (
      `🔥 <b>PUMP.FUN MOVERS</b>\n\n` +
      `No coins right now. Tap refresh.`
    );
  }
  const lines = items.slice(0, 12).map((t, i) => {
    const mc =
      t.marketCap != null
        ? t.marketCap >= 1e6
          ? `$${(t.marketCap / 1e6).toFixed(2)}M`
          : t.marketCap >= 1e3
            ? `$${(t.marketCap / 1e3).toFixed(1)}K`
            : `$${t.marketCap.toFixed(0)}`
        : '—';
    return (
      `<b>${i + 1}. $${t.symbol}</b> · ${t.name}\n` +
      `MC ${mc} · <code>${t.mint.slice(0, 6)}…${t.mint.slice(-4)}</code> · pump`
    );
  });
  return (
    `🔥 <b>PUMP.FUN MOVERS</b>\n` +
    `<i>Live · Solana only</i>\n\n` +
    lines.join('\n\n') +
    `\n\nTap Buy under a coin or paste a mint.`
  );
}
