/**
 * Token image + sparkline enrichment for the web terminal.
 */

export type TerminalToken = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  ageMin: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume: number | null;
  priceUsd: number | null;
  changePct: number | null;
  buys: number | null;
  sells: number | null;
  taxBuy: number | null;
  taxSell: number | null;
  safety: {
    score: number;
    paid: boolean;
    risk: 'low' | 'med' | 'high';
    labels: string[];
  };
  sparkline: number[];
  source: 'pump' | 'dex';
  url: string;
};

const imgCache = new Map<string, { at: number; url: string | null }>();
const sparkCache = new Map<string, { at: number; pts: number[] }>();
const IMG_TTL = 10 * 60_000;
const SPARK_TTL = 60_000;

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; SOLCLAW/1.0)',
};

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function resolveTokenImage(
  mint: string,
  hint?: string | null
): Promise<string | null> {
  if (hint && /^https?:\/\//i.test(hint)) return hint;
  const hit = imgCache.get(mint);
  if (hit && Date.now() - hit.at < IMG_TTL) return hit.url;

  const pump = await fetchJson(`https://frontend-api-v3.pump.fun/coins/${mint}`);
  if (pump && typeof pump === 'object') {
    const c = pump as Record<string, unknown>;
    const uri = String(c.image_uri || c.image || c.uri || '');
    if (uri.startsWith('http')) {
      imgCache.set(mint, { at: Date.now(), url: uri });
      return uri;
    }
  }

  const dex = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (dex && typeof dex === 'object') {
    const pairs = (dex as { pairs?: Record<string, unknown>[] }).pairs ?? [];
    for (const p of pairs) {
      if (p.chainId !== 'solana') continue;
      const info = p.info as Record<string, unknown> | undefined;
      const img = String(info?.imageUrl || '');
      if (img.startsWith('http')) {
        imgCache.set(mint, { at: Date.now(), url: img });
        return img;
      }
    }
  }

  const jup = await fetchJson(`https://tokens.jup.ag/token/${mint}`);
  if (jup && typeof jup === 'object') {
    const img = String((jup as Record<string, unknown>).logoURI || '');
    if (img.startsWith('http')) {
      imgCache.set(mint, { at: Date.now(), url: img });
      return img;
    }
  }

  imgCache.set(mint, { at: Date.now(), url: null });
  return null;
}

export async function resolveSparkline(
  mint: string,
  changePct: number | null,
  price: number | null
): Promise<number[]> {
  const hit = sparkCache.get(mint);
  if (hit && Date.now() - hit.at < SPARK_TTL) return hit.pts;

  try {
    const dex = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const pairs =
      dex && typeof dex === 'object'
        ? ((dex as { pairs?: Record<string, unknown>[] }).pairs ?? [])
        : [];
    const sol = pairs.find((p) => p.chainId === 'solana') as
      | Record<string, unknown>
      | undefined;
    if (sol) {
      const pc = sol.priceChange as Record<string, number> | undefined;
      const base = price && price > 0 ? price : 1;
      const m5 = pc?.m5 ?? 0;
      const h1 = pc?.h1 ?? changePct ?? 0;
      const h6 = pc?.h6 ?? h1;
      const h24 = pc?.h24 ?? changePct ?? 0;
      const pts: number[] = [];
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const ch = t < 0.25 ? h24 : t < 0.5 ? h6 : t < 0.75 ? h1 : m5;
        const factor = 1 - (ch / 100) * (1 - t);
        pts.push(base * Math.max(0.01, factor));
      }
      sparkCache.set(mint, { at: Date.now(), pts });
      return pts;
    }
  } catch {
    /* */
  }

  const ch = changePct ?? 0;
  const base = price && price > 0 ? price : 1;
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const noise = Math.sin(i * 1.7) * 0.02 * base;
    pts.push(base * (1 - (ch / 100) * (1 - t)) + noise);
  }
  sparkCache.set(mint, { at: Date.now(), pts });
  return pts;
}

function ageFromTs(ts: number | null | undefined): number | null {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null;
  const ms = ts > 1e12 ? ts : ts > 1e9 ? ts * 1000 : null;
  if (ms == null) return null;
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 0) return null;
  // hide ages older than 30d in meme terminal
  if (min > 60 * 24 * 30) return null;
  return min;
}

export async function enrichTerminalToken(raw: {
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
  image?: string | null;
  createdAt?: number | null;
}): Promise<TerminalToken> {
  const image = await resolveTokenImage(raw.mint, raw.image);
  const sparkline = await resolveSparkline(raw.mint, raw.change24h, raw.priceUsd);

  let buys: number | null = null;
  let sells: number | null = null;
  let liq = raw.liquidity;
  let vol = raw.volume24h;
  let mcap = raw.marketCap;
  let price = raw.priceUsd;
  let change = raw.change24h;
  let ageMin: number | null = ageFromTs(raw.createdAt ?? null);

  try {
    const dex = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${raw.mint}`);
    const pairs =
      dex && typeof dex === 'object'
        ? ((dex as { pairs?: Record<string, unknown>[] }).pairs ?? [])
        : [];
    const sol = pairs.find((p) => p.chainId === 'solana') as
      | Record<string, unknown>
      | undefined;
    if (sol) {
      const txns = sol.txns as {
        h24?: { buys?: number; sells?: number };
        h1?: { buys?: number; sells?: number };
      } | undefined;
      buys = txns?.h1?.buys ?? txns?.h24?.buys ?? null;
      sells = txns?.h1?.sells ?? txns?.h24?.sells ?? null;
      const L = sol.liquidity as { usd?: number } | undefined;
      if (L?.usd != null) liq = L.usd;
      const V = sol.volume as { h24?: number } | undefined;
      if (V?.h24 != null) vol = V.h24;
      if (sol.priceUsd != null) price = Number(sol.priceUsd);
      const pc = sol.priceChange as { h24?: number } | undefined;
      if (pc?.h24 != null) change = pc.h24;
      if (typeof sol.marketCap === 'number') mcap = sol.marketCap;
      else if (typeof sol.fdv === 'number') mcap = sol.fdv;
      if (typeof sol.pairCreatedAt === 'number') {
        const pairAge = ageFromTs(sol.pairCreatedAt);
        if (pairAge != null && (ageMin == null || pairAge < ageMin)) {
          ageMin = pairAge;
        }
      }
    }
  } catch {
    /* */
  }

  let score = 55;
  const labels: string[] = [];
  if (raw.source === 'pump') {
    labels.push('pump');
    score += 5;
  }
  if ((liq ?? 0) > 10_000) {
    score += 15;
    labels.push('liq');
  } else if ((liq ?? 0) < 1000) {
    score -= 20;
    labels.push('thin liq');
  }
  if ((buys ?? 0) + (sells ?? 0) > 50) score += 10;
  const risk: 'low' | 'med' | 'high' =
    score >= 70 ? 'low' : score >= 45 ? 'med' : 'high';

  return {
    mint: raw.mint,
    name: raw.name,
    symbol: raw.symbol,
    image,
    ageMin,
    marketCap: mcap,
    liquidity: liq,
    volume: vol,
    priceUsd: price,
    changePct: change,
    buys,
    sells,
    taxBuy: null,
    taxSell: null,
    safety: {
      score: Math.max(0, Math.min(99, score)),
      paid: false,
      risk,
      labels,
    },
    sparkline,
    source: raw.source,
    url: raw.url,
  };
}
