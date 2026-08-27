/**
 * Real market data via DexScreener.
 * Never invent prices. Works for pump.fun graduated + bonded tokens with pairs.
 */

import { env } from '../config/env.js';

export type MarketSnapshot = {
  mint: string;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  pairAddress?: string;
  dexId?: string;
  available: boolean;
};

type CacheEntry = { data: MarketSnapshot; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 15_000;

export async function getMarketData(mint: string): Promise<MarketSnapshot> {
  const cached = cache.get(mint);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const empty: MarketSnapshot = {
    mint,
    priceUsd: null,
    marketCap: null,
    liquidityUsd: null,
    volume24h: null,
    priceChange24h: null,
    available: false,
  };

  try {
    const url = `${env.DEXSCREENER_API}/tokens/${mint}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      cache.set(mint, { data: empty, expires: Date.now() + 5_000 });
      return empty;
    }
    const json = (await res.json()) as {
      pairs?: Array<{
        chainId?: string;
        priceUsd?: string;
        liquidity?: { usd?: number };
        volume?: { h24?: number };
        priceChange?: { h24?: number };
        fdv?: number;
        marketCap?: number;
        pairAddress?: string;
        dexId?: string;
      }>;
    };

    const pairs = (json.pairs ?? []).filter(
      (p) => (p.chainId ?? '').toLowerCase() === 'solana'
    );
    if (pairs.length === 0) {
      cache.set(mint, { data: empty, expires: Date.now() + 5_000 });
      return empty;
    }

    pairs.sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
    );
    const best = pairs[0];
    const priceUsd = best.priceUsd ? Number(best.priceUsd) : null;
    const snapshot: MarketSnapshot = {
      mint,
      priceUsd: priceUsd != null && !Number.isNaN(priceUsd) ? priceUsd : null,
      marketCap: best.marketCap ?? best.fdv ?? null,
      liquidityUsd: best.liquidity?.usd ?? null,
      volume24h: best.volume?.h24 ?? null,
      priceChange24h: best.priceChange?.h24 ?? null,
      pairAddress: best.pairAddress,
      dexId: best.dexId,
      available: priceUsd != null && !Number.isNaN(priceUsd),
    };

    cache.set(mint, { data: snapshot, expires: Date.now() + TTL_MS });
    return snapshot;
  } catch {
    cache.set(mint, { data: empty, expires: Date.now() + 5_000 });
    return empty;
  }
}

export function formatUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(digits);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
}
