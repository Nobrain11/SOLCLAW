/**
 * Token scanner pipeline for pump.fun / Solana mints:
 * ADDRESS → validate → metadata → market → liquidity → safety → analysis
 */

import { PublicKey } from '@solana/web3.js';
import { isValidPublicKey, getConnection } from './rpc.js';
import { getMarketData, formatUsd } from './market.js';
import { assessSafety } from './safety.js';
import type { TokenAnalysis } from '../types/trading.js';

async function fetchOnChainMetadata(mint: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
} | null> {
  try {
    const conn = getConnection();
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    const data = info.value?.data;
    if (!data || typeof data === 'string' || !('parsed' in data)) {
      return null;
    }
    const parsed = data.parsed as {
      type?: string;
      info?: { decimals?: number };
    };
    if (parsed.type !== 'mint') return null;
    const decimals = parsed.info?.decimals ?? 9;
    return {
      name: mint.slice(0, 4) + '…' + mint.slice(-4),
      symbol: 'UNKNOWN',
      decimals,
    };
  } catch {
    return null;
  }
}

async function enrichFromDex(mint: string): Promise<{ name: string; symbol: string } | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      pairs?: Array<{
        baseToken?: { address?: string; name?: string; symbol?: string };
        quoteToken?: { address?: string; name?: string; symbol?: string };
      }>;
    };
    for (const p of json.pairs ?? []) {
      if (p.baseToken?.address?.toLowerCase() === mint.toLowerCase()) {
        return {
          name: p.baseToken.name || 'Unknown',
          symbol: p.baseToken.symbol || '???',
        };
      }
      if (p.quoteToken?.address?.toLowerCase() === mint.toLowerCase()) {
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

export async function scanToken(mint: string): Promise<TokenAnalysis> {
  const trimmed = mint.trim();

  if (!isValidPublicKey(trimmed)) {
    return {
      mint: trimmed,
      name: 'Invalid',
      symbol: '—',
      decimals: 0,
      price: null,
      marketCap: null,
      liquidity: null,
      volume24h: null,
      priceChange24h: null,
      safetyScore: 0,
      safetyLevel: 'HIGH_RISK',
      warnings: ['Invalid Solana address'],
      tradable: false,
      mintAuthority: null,
      freezeAuthority: null,
    };
  }

  const [market, onChain, dexMeta] = await Promise.all([
    getMarketData(trimmed),
    fetchOnChainMetadata(trimmed),
    enrichFromDex(trimmed),
  ]);

  const safety = await assessSafety(trimmed, market);

  const name = dexMeta?.name ?? onChain?.name ?? 'Unknown';
  const symbol = dexMeta?.symbol ?? onChain?.symbol ?? '???';
  const decimals = onChain?.decimals ?? 9;

  const tradable =
    market.available &&
    (market.liquidityUsd ?? 0) > 0 &&
    safety.level !== 'HIGH_RISK';

  return {
    mint: trimmed,
    name,
    symbol,
    decimals,
    price: market.priceUsd,
    marketCap: market.marketCap,
    liquidity: market.liquidityUsd,
    volume24h: market.volume24h,
    priceChange24h: market.priceChange24h,
    safetyScore: safety.score,
    safetyLevel: safety.level,
    warnings: safety.warnings,
    tradable,
    mintAuthority: safety.mintAuthority,
    freezeAuthority: safety.freezeAuthority,
  };
}

export function formatTokenAnalysisMessage(t: TokenAnalysis): string {
  const price = t.price != null ? `$${formatUsd(t.price, 8)}` : '—';
  const mc = formatUsd(t.marketCap);
  const liq = formatUsd(t.liquidity);
  const chg =
    t.priceChange24h != null
      ? `${t.priceChange24h >= 0 ? '+' : ''}${t.priceChange24h.toFixed(1)}%`
      : '—';

  let safetyLine = `🛡 Safety: ${t.safetyLevel}`;
  if (t.warnings.length) {
    safetyLine += '\n' + t.warnings.map((w) => `⚠️ ${w}`).join('\n');
  }

  return (
    `🐱 <b>${escapeHtml(t.name)}</b> ($${escapeHtml(t.symbol)})\n\n` +
    `💵 Price: ${price}\n` +
    `💎 MC: $${mc}\n` +
    `💧 Liquidity: $${liq}\n\n` +
    `${safetyLine}\n` +
    `📊 24h: ${chg}\n\n` +
    `Choose action:`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
