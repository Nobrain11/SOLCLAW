/**
 * Token scanner — pump.fun + DexScreener + on-chain.
 * Never throws; always returns TokenAnalysis.
 */

import { PublicKey } from '@solana/web3.js';
import { isValidPublicKey, getConnection } from './rpc.js';
import { getMarketData, formatUsd } from './market.js';
import { assessSafety } from './safety.js';
import type { TokenAnalysis } from '../types/trading.js';

const PUMP_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; SOLCLAW/1.0)',
  Origin: 'https://pump.fun',
  Referer: 'https://pump.fun/',
};

async function fetchJson(
  url: string,
  headers?: Record<string, string>
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: headers ?? { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPumpMeta(mint: string): Promise<{
  name: string;
  symbol: string;
  priceUsd: number | null;
  marketCap: number | null;
  complete: boolean;
} | null> {
  const bases = [
    'https://frontend-api-v3.pump.fun',
    'https://frontend-api.pump.fun',
  ];
  for (const base of bases) {
    const json = await fetchJson(`${base}/coins/${mint}`, PUMP_HEADERS);
    if (!json || typeof json !== 'object') continue;
    const c = json as Record<string, unknown>;
    const name = String(c.name ?? '').trim();
    const symbol = String(c.symbol ?? '').trim();
    if (!name && !symbol) continue;
    const price = Number(c.price_usd ?? c.usd_price ?? NaN);
    const mc = Number(c.usd_market_cap ?? c.market_cap ?? NaN);
    return {
      name: name || 'Unknown',
      symbol: symbol || '???',
      priceUsd: Number.isFinite(price) ? price : null,
      marketCap: Number.isFinite(mc) ? mc : null,
      complete: Boolean(c.complete),
    };
  }
  return null;
}

async function fetchOnChainMetadata(mint: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
} | null> {
  try {
    const conn = getConnection();
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    const data = info.value?.data;
    if (!data || typeof data === 'string' || !('parsed' in data)) return null;
    const parsed = data.parsed as {
      type?: string;
      info?: { decimals?: number };
    };
    if (parsed.type !== 'mint') return null;
    return {
      name: `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      symbol: 'TOKEN',
      decimals: parsed.info?.decimals ?? 9,
    };
  } catch {
    return null;
  }
}

async function enrichFromDex(
  mint: string
): Promise<{ name: string; symbol: string } | null> {
  try {
    const json = await fetchJson(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`
    );
    if (!json || typeof json !== 'object') return null;
    const pairs =
      (
        json as {
          pairs?: Array<{
            chainId?: string;
            baseToken?: { address?: string; name?: string; symbol?: string };
            quoteToken?: { address?: string; name?: string; symbol?: string };
          }>;
        }
      ).pairs ?? [];
    for (const p of pairs) {
      if ((p.chainId ?? '').toLowerCase() !== 'solana') continue;
      if (p.baseToken?.address === mint) {
        return {
          name: p.baseToken.name || 'Unknown',
          symbol: p.baseToken.symbol || '???',
        };
      }
      if (p.quoteToken?.address === mint) {
        return {
          name: p.quoteToken.name || 'Unknown',
          symbol: p.quoteToken.symbol || '???',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function emptyAnalysis(mint: string, warnings: string[] = []): TokenAnalysis {
  return {
    mint,
    name: 'Unknown',
    symbol: '???',
    decimals: 9,
    price: null,
    marketCap: null,
    liquidity: null,
    volume24h: null,
    priceChange24h: null,
    safetyScore: 0,
    safetyLevel: 'HIGH_RISK',
    warnings,
    tradable: false,
    mintAuthority: null,
    freezeAuthority: null,
  };
}

export async function scanToken(mint: string): Promise<TokenAnalysis> {
  try {
    const trimmed = mint.trim();
    if (!isValidPublicKey(trimmed)) {
      return emptyAnalysis(trimmed, ['Invalid Solana address']);
    }

    const [market, onChain, dexMeta, pumpMeta] = await Promise.all([
      getMarketData(trimmed).catch(() => ({
        mint: trimmed,
        priceUsd: null as number | null,
        marketCap: null as number | null,
        liquidityUsd: null as number | null,
        volume24h: null as number | null,
        priceChange24h: null as number | null,
        available: false,
      })),
      fetchOnChainMetadata(trimmed).catch(() => null),
      enrichFromDex(trimmed).catch(() => null),
      fetchPumpMeta(trimmed).catch(() => null),
    ]);

    let safety = {
      score: 40,
      level: 'MEDIUM' as const,
      warnings: [] as string[],
      mintAuthority: null as string | null,
      freezeAuthority: null as string | null,
    };
    try {
      safety = await assessSafety(trimmed, market);
    } catch {
      safety.warnings.push('Safety check incomplete');
    }

    const name = pumpMeta?.name ?? dexMeta?.name ?? onChain?.name ?? 'Unknown';
    const symbol =
      pumpMeta?.symbol ?? dexMeta?.symbol ?? onChain?.symbol ?? '???';
    const decimals = onChain?.decimals ?? 9;

    const price = market.priceUsd ?? pumpMeta?.priceUsd ?? null;
    const marketCap = market.marketCap ?? pumpMeta?.marketCap ?? null;

    const warnings = [...(safety.warnings ?? [])];
    if (pumpMeta && !pumpMeta.complete) {
      warnings.unshift('On pump.fun bonding curve');
    }
    if (!market.available && !pumpMeta) {
      warnings.push('No live market data yet');
    }

    const tradable =
      price != null &&
      price > 0 &&
      safety.level !== 'HIGH_RISK' &&
      ((market.liquidityUsd ?? 0) > 0 || !!pumpMeta);

    return {
      mint: trimmed,
      name,
      symbol,
      decimals,
      price,
      marketCap,
      liquidity: market.liquidityUsd ?? null,
      volume24h: market.volume24h ?? null,
      priceChange24h: market.priceChange24h ?? null,
      safetyScore: safety.score,
      safetyLevel: safety.level,
      warnings,
      tradable,
      mintAuthority: safety.mintAuthority,
      freezeAuthority: safety.freezeAuthority,
    };
  } catch (e) {
    console.error('[scanner] scanToken failed', e);
    return emptyAnalysis(mint.trim(), [
      e instanceof Error ? e.message : 'Scan failed',
    ]);
  }
}

export function formatTokenAnalysisMessage(t: TokenAnalysis): string {
  const price = t.price != null ? `$${formatUsd(t.price, 8)}` : '—';
  const mc = formatUsd(t.marketCap);
  const liq = formatUsd(t.liquidity);
  const chg =
    t.priceChange24h != null
      ? `${t.priceChange24h >= 0 ? '+' : ''}${t.priceChange24h.toFixed(1)}%`
      : '—';
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false });

  const safetyIcon =
    t.safetyLevel === 'HIGH' || t.safetyLevel === 'SAFE'
      ? '🟢'
      : t.safetyLevel === 'MEDIUM'
        ? '🟡'
        : '🔴';

  let warns = '';
  if (t.warnings?.length) {
    warns = '\n' + t.warnings.slice(0, 4).map((w) => `⚠️ ${w}`).join('\n');
  }

  const tradeLine = t.tradable ? `\n✅ Tradable` : `\n⛔ Not tradable yet`;

  return (
    `⚡ <b>$${escapeHtml(t.symbol)}</b> · ${escapeHtml(t.name)}\n` +
    `<code>${t.mint}</code>\n\n` +
    `📊 MC $${mc}  ·  💸 ${price}\n` +
    `💧 Liq $${liq}  ·  24h ${chg}\n` +
    `${safetyIcon} Safety: ${t.safetyLevel}${warns}${tradeLine}\n\n` +
    `🕒 ${now}`
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}
