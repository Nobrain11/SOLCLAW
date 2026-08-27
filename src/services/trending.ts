/**
 * Trending pump.fun tokens feed.
 * Primary: pump.fun frontend API
 * Fallback: DexScreener Solana pairs by volume
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
};

const PUMP_BASE = 'https://frontend-api.pump.fun';
const CACHE_MS = 45_000;

let cache: { at: number; items: TrendingToken[] } | null = null;

function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

async function fetchPumpFun(limit = 12): Promise<TrendingToken[]> {
  const urls = [
    `${PUMP_BASE}/coins?offset=0&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`,
    `${PUMP_BASE}/coins?offset=0&limit=${limit}&sort=market_cap&order=DESC&includeNsfw=false`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SOLTradeBot/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data) || data.length === 0) continue;

      const items: TrendingToken[] = [];
      for (const raw of data) {
        const c = raw as Record<string, unknown>;
        const mint = String(c.mint ?? c.address ?? '');
        if (!mint || mint.length < 32) continue;
        const mc =
          typeof c.usd_market_cap === 'number'
            ? c.usd_market_cap
            : typeof c.market_cap === 'number'
              ? c.market_cap
              : null;
        const price =
          typeof c.price_usd === 'number'
            ? c.price_usd
            : typeof c.usd_price === 'number'
              ? c.usd_price
              : null;
        items.push({
          mint,
          name: String(c.name ?? 'Unknown').slice(0, 24),
          symbol: String(c.symbol ?? '???').slice(0, 12),
          priceUsd: price,
          marketCap: mc,
          volume24h:
            typeof c.volume_24h === 'number'
              ? c.volume_24h
              : typeof c.volume === 'number'
                ? c.volume
                : null,
          change24h: null,
          liquidity: null,
          source: 'pump',
          url: `https://pump.fun/${mint}`,
        });
      }
      if (items.length > 0) return items.slice(0, limit);
    } catch {
      /* try next */
    }
  }
  return [];
}

async function fetchDexScreener(limit = 12): Promise<TrendingToken[]> {
  try {
    const boostRes = await fetch(
      'https://api.dexscreener.com/token-boosts/top/v1',
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    const boosts = boostRes.ok ? ((await boostRes.json()) as unknown[]) : [];

    const solBoosts = (Array.isArray(boosts) ? boosts : [])
      .filter((b) => {
        const x = b as Record<string, unknown>;
        return x.chainId === 'solana' || x.chainId === 'sol';
      })
      .slice(0, limit);

    const items: TrendingToken[] = [];

    const searchRes = await fetch(
      'https://api.dexscreener.com/latest/dex/search?q=pump',
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (searchRes.ok) {
      const body = (await searchRes.json()) as {
        pairs?: Array<Record<string, unknown>>;
      };
      const pairs = (body.pairs ?? [])
        .filter((p) => p.chainId === 'solana')
        .sort(
          (a, b) =>
            Number((b.volume as any)?.h24 ?? 0) -
            Number((a.volume as any)?.h24 ?? 0)
        )
        .slice(0, limit);

      for (const p of pairs) {
        const base = p.baseToken as Record<string, unknown> | undefined;
        const mint = String(base?.address ?? '');
        if (!mint) continue;
        const vol = p.volume as Record<string, number> | undefined;
        const liq = p.liquidity as Record<string, number> | undefined;
        const ch = p.priceChange as Record<string, number> | undefined;
        items.push({
          mint,
          name: String(base?.name ?? 'Unknown').slice(0, 24),
          symbol: String(base?.symbol ?? '???').slice(0, 12),
          priceUsd: p.priceUsd != null ? Number(p.priceUsd) : null,
          marketCap:
            p.marketCap != null
              ? Number(p.marketCap)
              : p.fdv != null
                ? Number(p.fdv)
                : null,
          volume24h: vol?.h24 ?? null,
          change24h: ch?.h24 ?? null,
          liquidity: liq?.usd ?? null,
          source: 'dex',
          url: String(p.url ?? `https://dexscreener.com/solana/${mint}`),
        });
      }
    }

    for (const b of solBoosts) {
      const x = b as Record<string, unknown>;
      const mint = String(x.tokenAddress ?? '');
      if (!mint || items.some((i) => i.mint === mint)) continue;
      items.push({
        mint,
        name: String(x.description ?? mint.slice(0, 8)).slice(0, 24),
        symbol: 'BOOST',
        priceUsd: null,
        marketCap: null,
        volume24h: null,
        change24h: null,
        liquidity: null,
        source: 'dex',
        url: `https://dexscreener.com/solana/${mint}`,
      });
    }

    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export async function getTrendingTokens(
  limit = 10,
  force = false
): Promise<TrendingToken[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.items.slice(0, limit);
  }

  let items = await fetchPumpFun(limit);
  if (items.length < 3) {
    const dex = await fetchDexScreener(limit);
    const seen = new Set(items.map((i) => i.mint));
    for (const d of dex) {
      if (seen.has(d.mint)) continue;
      items.push(d);
      seen.add(d.mint);
      if (items.length >= limit) break;
    }
  }

  cache = { at: Date.now(), items };
  return items.slice(0, limit);
}

export function formatTrendingMessage(
  items: TrendingToken[],
  title = '🔥 <b>TRENDING — pump.fun</b>'
): string {
  if (items.length === 0) {
    return (
      `${title}\n\n` +
      `No live data right now.\n` +
      `Paste a token address in Manual Trade to scan.`
    );
  }

  const lines = items.map((tok, i) => {
    const mc = fmtNum(tok.marketCap);
    const vol = tok.volume24h != null ? fmtNum(tok.volume24h) : null;
    const ch = tok.change24h != null ? fmtPct(tok.change24h) : null;
    const meta = [`MC ${mc}`, vol ? `Vol ${vol}` : null, ch ? ch : null]
      .filter(Boolean)
      .join(' · ');
    return (
      `<b>${i + 1}. $${tok.symbol}</b> · ${tok.name}\n` +
      `   ${meta}\n` +
      `   <code>${tok.mint}</code>`
    );
  });

  return (
    `${title}\n` +
    `<i>Tap address to copy → Manual Trade to buy</i>\n\n` +
    lines.join('\n\n')
  );
}
