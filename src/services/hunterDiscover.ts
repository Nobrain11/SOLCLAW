/** Helius + pump API discovery queue for Auto-Hunter */

import { discoverPumpCandidates } from './helius.js';
import { getSocialPulse, socialGate } from './social.js';
import type { TrendingToken } from './trending.js';
import { getTrendingTokens } from './trending.js';

export async function discoverQueue(limit = 8): Promise<TrendingToken[]> {
  const discovered = await discoverPumpCandidates(16);
  const trending = await getTrendingTokens(12, true);
  const byMint = new Map(trending.map((t) => [t.mint, t]));
  const queue: TrendingToken[] = [];
  for (const d of discovered) {
    const meta = byMint.get(d.mint);
    queue.push(
      meta ?? {
        mint: d.mint,
        name: 'pump',
        symbol: d.mint.slice(0, 4),
        priceUsd: null,
        marketCap: null,
        volume24h: null,
        change24h: null,
        liquidity: null,
        source: 'pump',
        url: `https://pump.fun/${d.mint}`,
      }
    );
  }
  for (const t of trending) {
    if (!queue.some((q) => q.mint === t.mint)) queue.push(t);
  }
  return queue.slice(0, limit);
}

export async function applySocialFilter(
  mint: string,
  symbol: string,
  volHeat: boolean
): Promise<{ pass: boolean; reason: string; boost: boolean }> {
  const pulse = await getSocialPulse(mint, symbol);
  const gate = socialGate(pulse, volHeat);
  return {
    pass: gate.pass,
    reason: gate.reason,
    boost: pulse.level === 'hot',
  };
}
