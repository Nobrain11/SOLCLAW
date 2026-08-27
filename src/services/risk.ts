/**
 * Risk engine — every live trade must pass.
 */

import { env } from '../config/env.js';
import { getWalletInfo } from './wallet.js';
import { countOpen } from './positions.js';
import type { RiskCheckResult, TradeMode, TokenAnalysis } from '../types/trading.js';

export async function checkTradeRisk(input: {
  userId: number;
  amountSol: number;
  mode: TradeMode;
  token?: TokenAnalysis;
  slippageBps?: number;
}): Promise<RiskCheckResult> {
  const { userId, amountSol, mode, token, slippageBps } = input;

  if (amountSol <= 0) {
    return { allowed: false, reason: 'Invalid trade amount' };
  }

  if (amountSol > env.MAX_TRADE_SOL) {
    return {
      allowed: false,
      reason: `Amount exceeds max trade size (${env.MAX_TRADE_SOL} SOL)`,
    };
  }

  const open = countOpen(userId, mode);
  if (open >= env.MAX_OPEN_POSITIONS) {
    return {
      allowed: false,
      reason: `Maximum open positions reached (${env.MAX_OPEN_POSITIONS})`,
    };
  }

  if (mode === 'LIVE') {
    const wallet = await getWalletInfo(userId);
    if (!wallet) {
      return { allowed: false, reason: 'Trading wallet unavailable' };
    }
    const feeBuffer = 0.01;
    if (amountSol + feeBuffer > wallet.balanceSol) {
      return { allowed: false, reason: 'Insufficient SOL balance' };
    }
  }

  if (token) {
    if (!token.tradable) {
      return { allowed: false, reason: 'Token not tradable or high risk' };
    }
    if (token.safetyLevel === 'HIGH_RISK') {
      return { allowed: false, reason: 'Token safety: HIGH RISK' };
    }
    if (token.safetyLevel === 'UNKNOWN' && mode === 'LIVE') {
      return {
        allowed: false,
        reason: 'Market data unavailable — live trade blocked',
      };
    }
  }

  if (slippageBps != null && slippageBps > 1000) {
    return { allowed: false, reason: 'Slippage too high (>10%)' };
  }

  return { allowed: true };
}
