/**
 * Token safety signals for pump.fun / Solana mints.
 * Risk indicators only — not guarantees.
 */

import { PublicKey } from '@solana/web3.js';
import { getConnection, isValidPublicKey } from './rpc.js';
import type { MarketSnapshot } from './market.js';
import type { SafetyLevel } from '../types/trading.js';

export type SafetyReport = {
  score: number;
  level: SafetyLevel;
  warnings: string[];
  positives: string[];
  mintAuthority: string | null;
  freezeAuthority: string | null;
};

async function getMintInfo(mint: string): Promise<{
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supply: string;
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
      info?: {
        mintAuthority?: string | null;
        freezeAuthority?: string | null;
        supply?: string;
        decimals?: number;
      };
    };
    const i = parsed.info;
    if (!i) return null;
    return {
      mintAuthority: i.mintAuthority ?? null,
      freezeAuthority: i.freezeAuthority ?? null,
      supply: i.supply ?? '0',
      decimals: i.decimals ?? 0,
    };
  } catch {
    return null;
  }
}

export async function assessSafety(
  mint: string,
  market: MarketSnapshot
): Promise<SafetyReport> {
  const warnings: string[] = [];
  const positives: string[] = [];
  let score = 50;

  if (!isValidPublicKey(mint)) {
    return {
      score: 0,
      level: 'HIGH_RISK',
      warnings: ['Invalid mint address'],
      positives: [],
      mintAuthority: null,
      freezeAuthority: null,
    };
  }

  const mintInfo = await getMintInfo(mint);
  let mintAuthority: string | null = null;
  let freezeAuthority: string | null = null;

  if (!mintInfo) {
    warnings.push('Could not load mint account');
    score -= 15;
  } else {
    mintAuthority = mintInfo.mintAuthority;
    freezeAuthority = mintInfo.freezeAuthority;

    if (mintAuthority) {
      warnings.push('Mint authority still active (can mint more tokens)');
      score -= 25;
    } else {
      positives.push('Mint authority revoked');
      score += 15;
    }

    if (freezeAuthority) {
      warnings.push('Freeze authority active (can freeze accounts)');
      score -= 20;
    } else {
      positives.push('No freeze authority');
      score += 10;
    }
  }

  if (!market.available) {
    warnings.push('Market data unavailable');
    score -= 20;
  } else {
    positives.push('Market data available');
    score += 5;

    const liq = market.liquidityUsd ?? 0;
    if (liq < 1_000) {
      warnings.push('Very low liquidity (< $1k)');
      score -= 25;
    } else if (liq < 10_000) {
      warnings.push('Low liquidity (< $10k)');
      score -= 10;
    } else if (liq >= 50_000) {
      positives.push('Liquidity detected');
      score += 10;
    } else {
      positives.push('Liquidity detected');
      score += 5;
    }

    if ((market.volume24h ?? 0) < 100 && liq > 0) {
      warnings.push('Very low 24h volume');
      score -= 5;
    }
  }

  score = Math.max(0, Math.min(100, score));

  let level: SafetyLevel;
  if (!market.available && !mintInfo) {
    level = 'UNKNOWN';
  } else if (score >= 70) {
    level = 'GOOD';
  } else if (score >= 40) {
    level = 'CAUTION';
  } else {
    level = 'HIGH_RISK';
  }

  return {
    score,
    level,
    warnings,
    positives,
    mintAuthority,
    freezeAuthority,
  };
}
