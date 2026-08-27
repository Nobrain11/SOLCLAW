/**
 * Auto-trade strategy definitions.
 * Each strategy returns explicit parameters — never bypasses global risk limits.
 */

import type { AutoStrategy, StrategyParams } from '../types/trading.js';

const STRATEGIES: Record<AutoStrategy, StrategyParams> = {
  careful: {
    riskPerTradeSol: 0.02,
    maxPositions: 2,
    minLiquidityUsd: 50_000,
    minSafetyScore: 70,
    takeProfitPct: 30,
    stopLossPct: -12,
    maxSlippageBps: 50,
  },
  balanced: {
    riskPerTradeSol: 0.05,
    maxPositions: 4,
    minLiquidityUsd: 20_000,
    minSafetyScore: 50,
    takeProfitPct: 50,
    stopLossPct: -20,
    maxSlippageBps: 80,
  },
  bold: {
    riskPerTradeSol: 0.1,
    maxPositions: 6,
    minLiquidityUsd: 8_000,
    minSafetyScore: 40,
    takeProfitPct: 100,
    stopLossPct: -30,
    maxSlippageBps: 150,
  },
  custom: {
    riskPerTradeSol: 0.05,
    maxPositions: 4,
    minLiquidityUsd: 15_000,
    minSafetyScore: 50,
    takeProfitPct: 50,
    stopLossPct: -20,
    maxSlippageBps: 100,
  },
};

const customOverrides = new Map<number, Partial<StrategyParams>>();

export function getStrategyParams(
  strategy: AutoStrategy,
  userId?: number
): StrategyParams {
  const base = { ...STRATEGIES[strategy] };
  if (strategy === 'custom' && userId != null) {
    const ov = customOverrides.get(userId);
    if (ov) Object.assign(base, ov);
  }
  return base;
}

export function setCustomParams(
  userId: number,
  patch: Partial<StrategyParams>
): StrategyParams {
  const current = customOverrides.get(userId) ?? {};
  const next = { ...current, ...patch };
  customOverrides.set(userId, next);
  return getStrategyParams('custom', userId);
}

export function listStrategies(): Array<{
  id: AutoStrategy;
  label: string;
  params: StrategyParams;
}> {
  return [
    { id: 'careful', label: '🛡 Careful', params: STRATEGIES.careful },
    { id: 'balanced', label: '⚖️ Balanced', params: STRATEGIES.balanced },
    { id: 'bold', label: '🚀 Bold', params: STRATEGIES.bold },
    { id: 'custom', label: '🧠 Custom', params: STRATEGIES.custom },
  ];
}

export function formatStrategyMessage(
  strategy: AutoStrategy,
  userId?: number
): string {
  const p = getStrategyParams(strategy, userId);
  return (
    `Strategy: <b>${strategy.toUpperCase()}</b>\n\n` +
    `💰 Risk/trade: ${p.riskPerTradeSol} SOL\n` +
    `📊 Max positions: ${p.maxPositions}\n` +
    `💧 Min liquidity: $${p.minLiquidityUsd.toLocaleString()}\n` +
    `🛡 Min safety score: ${p.minSafetyScore}\n` +
    `🎯 TP: +${p.takeProfitPct}%\n` +
    `🛑 SL: ${p.stopLossPct}%\n` +
    `📉 Max slippage: ${(p.maxSlippageBps / 100).toFixed(1)}%`
  );
}
