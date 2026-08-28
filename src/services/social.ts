/**
 * Social pulse for pump.fun tokens (Dex boosts + optional X).
 */

export type SocialPulse = {
  score: number;
  level: 'cold' | 'warm' | 'hot';
  mentions5m: number;
  sources: string[];
};

const cache = new Map<string, { at: number; pulse: SocialPulse }>();
const CACHE_MS = 60_000;

async function dexBoostSignal(
  mint: string
): Promise<{ score: number; note: string } | null> {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[];
    if (!Array.isArray(data)) return null;
    for (const raw of data) {
      const x = raw as Record<string, unknown>;
      if (
        String(x.tokenAddress) === mint &&
        (x.chainId === 'solana' || x.chainId === 'sol')
      ) {
        const amount = typeof x.amount === 'number' ? x.amount : 1;
        return { score: Math.min(40, 15 + amount), note: 'dex boost' };
      }
    }
  } catch {
    /* */
  }
  return null;
}

async function dexProfileSignal(
  mint: string
): Promise<{ score: number; note: string } | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: Record<string, unknown>[] };
    const pairs = data.pairs ?? [];
    const sol = pairs.find((p) => p.chainId === 'solana');
    if (!sol) return null;
    let score = 0;
    const notes: string[] = [];
    const vol = (sol.volume as Record<string, number> | undefined)?.h1 ?? 0;
    if (vol > 50_000) {
      score += 25;
      notes.push('vol heat');
    } else if (vol > 10_000) {
      score += 12;
      notes.push('vol warm');
    }
    const txns = sol.txns as { h1?: { buys?: number; sells?: number } } | undefined;
    const buys = txns?.h1?.buys ?? 0;
    if (buys >= 30) {
      score += 20;
      notes.push('buy velocity');
    } else if (buys >= 10) {
      score += 10;
      notes.push('buys');
    }
    if (score === 0) return null;
    return { score, note: notes.join(',') };
  } catch {
    return null;
  }
}

async function xMentionSignal(
  symbol: string
): Promise<{ count: number; score: number } | null> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  if (!bearer || !symbol) return null;
  try {
    const q = encodeURIComponent(`$${symbol} OR #${symbol} lang:en`);
    const res = await fetch(
      `https://api.twitter.com/2/tweets/counts/recent?query=${q}&granularity=minute`,
      {
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { tweet_count: number }[];
      meta?: { total_tweet_count?: number };
    };
    const last5 = (data.data ?? [])
      .slice(-5)
      .reduce((a, b) => a + (b.tweet_count ?? 0), 0);
    let score = 0;
    if (last5 >= 10) score = 40;
    else if (last5 >= 3) score = 20;
    else if (last5 >= 1) score = 8;
    return { count: last5, score };
  } catch {
    return null;
  }
}

export async function getSocialPulse(
  mint: string,
  symbol?: string
): Promise<SocialPulse> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pulse;

  let score = 0;
  let mentions5m = 0;
  const sources: string[] = [];

  const boost = await dexBoostSignal(mint);
  if (boost) {
    score += boost.score;
    sources.push(boost.note);
  }

  const profile = await dexProfileSignal(mint);
  if (profile) {
    score += profile.score;
    sources.push(profile.note);
  }

  if (symbol) {
    const x = await xMentionSignal(symbol);
    if (x) {
      score += x.score;
      mentions5m = x.count;
      sources.push(`x:${x.count}`);
    }
  }

  score = Math.min(100, score);
  const level: SocialPulse['level'] =
    score >= 50 || mentions5m >= 10
      ? 'hot'
      : score >= 20 || mentions5m >= 3
        ? 'warm'
        : 'cold';

  const pulse: SocialPulse = { score, level, mentions5m, sources };
  cache.set(mint, { at: Date.now(), pulse });
  return pulse;
}

export function socialGate(
  pulse: SocialPulse,
  hasVolumeHeat: boolean
): { pass: boolean; reason: string } {
  if (pulse.level === 'hot') return { pass: true, reason: 'social hot' };
  if (pulse.level === 'warm') return { pass: true, reason: 'social warm' };
  if (hasVolumeHeat) return { pass: true, reason: 'volume heat, social cold ok' };
  return { pass: false, reason: 'social cold, no smart flow' };
}
