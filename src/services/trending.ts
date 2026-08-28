/**
 * Live pump.fun coin scraper + Solana DEX fallback.
 * Priority: pump.fun (v3 API) → DexScreener Solana volume.
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
};

const CACHE_MS = 20_000;
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
    num(c.volume_24h) ??
    num(c.volume24h) ??
    num(c.volume) ??
    num(c.virtual_sol_reserves) ??
    null;
  return {
    mint,
    name: String(c.name ?? 'Unknown').slice(0, 28),
    symbol: String(c.symbol ?? '???').slice(0, 12),
    priceUsd: price,
    marketCap: mc,
    volume24h: vol,
    change24h: num(c.price_change_24h) ?? num(c.priceChange24h),
    liquidity: num(c.virtual_sol_reserves) ?? num(c.liquidity) ?? null,
    source: 'pump',
    url: `https://pump.fun/${mint}`,
    createdAt: num(c.created_timestamp) ?? num(c.createdAt),
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
      if (out.length >= limit) break;
      const url = `${base}/coins?offset=0&limit=${Math.min(limit * 2, 50)}&sort=${sort}&order=DESC&includeNsfw=false`;
      const data = await fetchJson(url);
      if (!Array.isArray(data)) continue;
      for (const raw of data) {
        const item = mapPumpCoin(raw as Record<string, unknown>);
        if (!item || seen.has(item.mint)) continue;
        seen.add(item.mint);
        out.push(item);
        if (out.length >= limit) break;
      }
    }
    if (out.length >= Math.min(8, limit)) break;
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

  return out.slice(0, limit);
}

async function fetchDexScreenerSolana(limit = 20): Promise<TrendingToken[]> {
  const urls = [
    'https://api.dexscreener.com/token-boosts/top/v1',
    'https://api.dexscreener.com/token-profiles/latest/v1',
  ];
  const mints: string[] = [];
  for (const url of urls) {
    const data = await fetchJson(url);
    if (!Array.isArray(data)) continue;
    for (const raw of data) {
      const x = raw as Record<string, unknown>;
      const chain = String(x.chainId ?? '');
      if (chain !== 'solana' && chain !== 'sol') continue;
      const mint = String(x.tokenAddress ?? '');
      if (mint.length >= 32) mints.push(mint);
    }
  }
  if (mints.length === 0) {
    const search = await fetchJson(
      'https://api.dexscreener.com/latest/dex/search?q=SOL'
    );
    const pairs =
      search && typeof search === 'object'
        ? ((search as { pairs?: unknown[] }).pairs ?? [])
        : [];
    for (const p of pairs) {
      const pair = p as Record<string, unknown>;
      if (pair.chainId !== 'solana') continue;
      const base = pair.baseToken as Record<string, unknown> | undefined;
      const mint = String(base?.address ?? '');
      if (mint.length >= 32) mints.push(mint);
    }
  }

  const unique = [...new Set(mints)].slice(0, limit);
  const items: TrendingToken[] = [];
  for (const mint of unique) {
    const data = await fetchJson(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`
    );
    const pairs =
      data && typeof data === 'object'
        ? ((data as { pairs?: unknown[] }).pairs ?? [])
        : [];
    const sol = pairs.find((p) => {
      const x = p as Record<string, unknown>;
      return x.chainId === 'solana';
    }) as Record<string, unknown> | undefined;
    if (!sol) continue;
    const base = sol.baseToken as Record<string, unknown> | undefined;
    items.push({
      mint,
      name: String(base?.name ?? 'Token').slice(0, 28),
      symbol: String(base?.symbol ?? '???').slice(0, 12),
      priceUsd: num(sol.priceUsd),
      marketCap: num(sol.marketCap) ?? num(sol.fdv),
      volume24h: num((sol.volume as Record<string, unknown> | undefined)?.h24),
      change24h: num(
        (sol.priceChange as Record<string, unknown> | undefined)?.h24
      ),
      liquidity: num((sol.liquidity as Record<string, unknown> | undefined)?.usd),
      source: 'dex',
      url: String(sol.url ?? `https://dexscreener.com/solana/${mint}`),
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function getTrendingTokens(
  limit = 16,
  force = false
): Promise<TrendingToken[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.items.slice(0, limit);
  }

  let items = await fetchPumpFun(limit);
  if (items.length < Math.min(6, limit)) {
    const dex = await fetchDexScreenerSolana(limit);
    const seen = new Set(items.map((i) => i.mint));
    for (const d of dex) {
      if (seen.has(d.mint)) continue;
      items.push(d);
      seen.add(d.mint);
    }
  }

  items.sort((a, b) => {
    const av = (a.volume24h ?? 0) + (a.marketCap ?? 0) * 0.01;
    const bv = (b.volume24h ?? 0) + (b.marketCap ?? 0) * 0.01;
    return bv - av;
  });

  items = items.slice(0, limit);
  cache = { at: Date.now(), items };
  return items;
}

export function formatTrendingMessage(items: TrendingToken[]): string {
  if (!items.length) {
    return (
      `🔥 <b>PUMP.FUN LIVE</b>\n\n` +
      `No coins returned right now. Tap refresh in a few seconds.`
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
    const tag = t.source === 'pump' ? 'pump' : 'dex';
    return (
      `<b>${i + 1}. $${t.symbol}</b> · ${t.name}\n` +
      `MC ${mc} · <code>${t.mint.slice(0, 6)}…${t.mint.slice(-4)}</code> · ${tag}`
    );
  });
  return (
    `🔥 <b>PUMP.FUN · LIVE</b>\n` +
    `<i>Scraped just now · Solana only</i>\n\n` +
    lines.join('\n\n') +
    `\n\nPaste a mint to open the trade card.`
  );
}
