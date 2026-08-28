/**
 * Trade history persistence (in-memory).
 */

import { randomUUID } from 'crypto';
import type { TradeMode, TradeRecord, TradeSide } from '../types/trading.js';

const records: TradeRecord[] = [];

export function recordTrade(input: {
  userId: number;
  mint: string;
  symbol: string;
  side: TradeSide;
  mode: TradeMode;
  quantity: number;
  price: number;
  valueSol: number;
  pnlSol?: number;
  pnlPct?: number;
  signature?: string;
  positionId?: string;
}): TradeRecord {
  const rec: TradeRecord = {
    id: randomUUID(),
    userId: input.userId,
    mint: input.mint,
    symbol: input.symbol,
    side: input.side,
    mode: input.mode,
    quantity: input.quantity,
    price: input.price,
    valueSol: input.valueSol,
    feeSol: 0,
    pnlSol: input.pnlSol,
    pnlPct: input.pnlPct,
    signature: input.signature,
    positionId: input.positionId,
    timestamp: Date.now(),
  };
  records.push(rec);
  return rec;
}

export function getHistory(
  userId: number,
  mode?: TradeMode,
  limit = 20
): TradeRecord[] {
  return records
    .filter((r) => r.userId === userId && (mode == null || r.mode === mode))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function getPnlStats(userId: number, mode?: TradeMode) {
  const list = records.filter(
    (r) => r.userId === userId && (mode == null || r.mode === mode)
  );
  const sells = list.filter((r) => r.side === 'SELL' && r.pnlSol != null);
  const wins = sells.filter((r) => (r.pnlSol ?? 0) > 0);
  const losses = sells.filter((r) => (r.pnlSol ?? 0) <= 0);
  const realized = sells.reduce((s, r) => s + (r.pnlSol ?? 0), 0);
  return {
    trades: list.length,
    wins: wins.length,
    losses: losses.length,
    winRate: sells.length ? (wins.length / sells.length) * 100 : 0,
    realizedPnl: realized,
  };
}

export function getAllHistoryRecords(): TradeRecord[] {
  return [...records];
}
