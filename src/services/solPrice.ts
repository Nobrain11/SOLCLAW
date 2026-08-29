/**
 * Live SOL/USD price for terminal header.
 * Never hardcode — DexScreener primary, CoinGecko fallback.
 */

export type SolPriceSnapshot = {
  priceUsd: number | null;
  change24h: number | null;
  updatedAt: number;
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TTL_MS = 12_000;

let cache: SolPriceSnapshot | null = null;

export async function getSolPrice(): Promise<SolPriceSnapshot> {
  if (cache && Date.now() - cache.updatedAt < TTL_MS) {
    return cache;
  }

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!res.ok) throw new Error('dex fail');
    const body = (await res.json()) as {
      pairs?: Array<{
        chainId?: string;
        priceUsd?: string;
        priceChange?: { h24?: number };
        liquidity?: { usd?: number };
      }>;
    };
    const pairs = (body.pairs ?? []).filter((p) => p.chainId === 'solana');
    pairs.sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
    );
    const top = pairs[0];
    const price = top?.priceUsd != null ? Number(top.priceUsd) : null;
    const change = top?.priceChange?.h24 ?? null;
    if (price != null && Number.isFinite(price)) {
      cache = {
        priceUsd: price,
        change24h: change ?? null,
        updatedAt: Date.now(),
      };
      return cache;
    }
  } catch {
    /* try CoinGecko */
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const j = (await res.json()) as {
        solana?: { usd?: number; usd_24h_change?: number };
      };
      const price = j.solana?.usd;
      if (price != null && Number.isFinite(price)) {
        cache = {
          priceUsd: price,
          change24h: j.solana?.usd_24h_change ?? null,
          updatedAt: Date.now(),
        };
        return cache;
      }
    }
  } catch {
    /* ignore */
  }

  if (cache) return cache;
  return { priceUsd: null, change24h: null, updatedAt: Date.now() };
}

export function formatSolHeader(snap: SolPriceSnapshot): string {
  if (snap.priceUsd == null) {
    return '◎ SOL —';
  }
  const ch = snap.change24h;
  let arrow = '';
  if (ch != null) {
    arrow = ch >= 0 ? ` ▲${ch.toFixed(2)}%` : ` ▼${Math.abs(ch).toFixed(2)}%`;
  }
  return `◎ SOL $${snap.priceUsd.toFixed(2)}${arrow}`;
}
