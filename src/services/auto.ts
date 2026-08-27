/**
 * Automated trading engine. OFF by default.
 * Enabling does NOT buy immediately.
 * pump.fun mints: evaluate via scanner → safety → strategy → risk → execute.
 */

import type { TradeMode } from '../types/trading.js';
import { getStrategyParams } from './strategies.js';
import { checkTradeRisk } from './risk.js';
import { executeTrade } from './trading.js';
import { countOpen } from './positions.js';
import { scanToken } from './scanner.js';

export type AutoEngineState = {
  userId: number;
  chatId: number;
  enabled: boolean;
  strategy: 'careful' | 'balanced' | 'bold' | 'custom';
  mode: TradeMode;
};

const engines = new Map<number, AutoEngineState>();

export function getAutoState(userId: number): AutoEngineState | undefined {
  return engines.get(userId);
}

export function setAutoEnabled(
  userId: number,
  chatId: number,
  enabled: boolean,
  strategy: AutoEngineState['strategy'] = 'balanced',
  mode: TradeMode = 'PAPER'
): AutoEngineState {
  const state: AutoEngineState = { userId, chatId, enabled, strategy, mode };
  engines.set(userId, state);
  return state;
}

export function setAutoStrategy(
  userId: number,
  strategy: AutoEngineState['strategy']
): void {
  const s = engines.get(userId);
  if (s) {
    s.strategy = strategy;
    engines.set(userId, s);
  }
}

export async function evaluateOpportunity(
  userId: number,
  mint: string
): Promise<{ acted: boolean; reason: string; signature?: string }> {
  const state = engines.get(userId);
  if (!state || !state.enabled) {
    return { acted: false, reason: 'Auto-trade is OFF' };
  }

  const params = getStrategyParams(state.strategy, userId);
  const open = countOpen(userId, state.mode);
  if (open >= params.maxPositions) {
    return { acted: false, reason: 'Max positions reached for strategy' };
  }

  const analysis = await scanToken(mint);
  if (analysis.safetyScore < params.minSafetyScore) {
    return {
      acted: false,
      reason: `Safety score ${analysis.safetyScore} < ${params.minSafetyScore}`,
    };
  }
  if ((analysis.liquidity ?? 0) < params.minLiquidityUsd) {
    return { acted: false, reason: 'Liquidity below strategy minimum' };
  }
  if (!analysis.tradable) {
    return { acted: false, reason: 'Token not tradable' };
  }

  const risk = await checkTradeRisk({
    userId,
    amountSol: params.riskPerTradeSol,
    mode: state.mode,
    token: analysis,
    slippageBps: params.maxSlippageBps,
  });
  if (!risk.allowed) {
    return { acted: false, reason: risk.reason ?? 'Risk blocked' };
  }

  const result = await executeTrade({
    userId,
    chatId: state.chatId,
    mint,
    side: 'BUY',
    amountSol: params.riskPerTradeSol,
    slippageBps: params.maxSlippageBps,
    takeProfitPct: params.takeProfitPct,
    stopLossPct: params.stopLossPct,
    mode: state.mode,
  });

  if (result.state === 'CONFIRMED') {
    return {
      acted: true,
      reason: `Bought ${analysis.symbol}`,
      signature: result.signature,
    };
  }
  return { acted: false, reason: result.error ?? 'Trade failed' };
}

export async function runAutoPass(
  mints: string[],
  alert?: (chatId: number, text: string) => Promise<void>
): Promise<void> {
  for (const [, state] of engines) {
    if (!state.enabled) continue;
    for (const mint of mints) {
      try {
        const res = await evaluateOpportunity(state.userId, mint);
        if (res.acted && alert) {
          await alert(
            state.chatId,
            `🤖 <b>AUTO BUY</b> [${state.mode}]\n\n${res.reason}` +
              (res.signature ? `\n<code>${res.signature}</code>` : '')
          ).catch(() => undefined);
        }
      } catch {
        /* continue */
      }
    }
  }
}
