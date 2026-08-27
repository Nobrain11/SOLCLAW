/**
 * Live SOL/USD price for Home header.
 */

export type SolPriceSnapshot = {
  priceUsd: number | null;
  change24h: number | null;
  updatedAt: number;
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TTL_MS = 30_000;

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
    cache = {
      priceUsd: price != null && Number.isFinite(price) ? price : null,
      change24h: change,
      updatedAt: Date.now(),
    };
    return cache;
  } catch {
    if (cache) return cache;
    return { priceUsd: null, change24h: null, updatedAt: Date.now() };
  }
}

export function formatSolHeader(snap: SolPriceSnapshot): string {
  if (snap.priceUsd == null) {
    return '◎ SOL —';
  }
  const ch = snap.change24h;
  let arrow = '';
  if (ch != null) {
    arrow = ch >= 0 ? ` ▲ ${ch.toFixed(2)}%` : ` ▼ ${Math.abs(ch).toFixed(2)}%`;
  }
  return `◎ SOL $${snap.priceUsd.toFixed(2)}${arrow}`;
}
