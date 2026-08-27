/**
 * Position tracking — LIVE and PAPER separated.
 * In-memory store; replace with DB persistence later.
 */

import { randomUUID } from 'node:crypto';
import type { Position, TradeMode } from '../types/trading.js';
import { getMarketData } from './market.js';

const positions = new Map<string, Position>();
const monitorIndex: Position[] = [];

export function trackPosition(pos: Position): void {
  if (pos.status === 'OPEN' && !monitorIndex.find((p) => p.id === pos.id)) {
    monitorIndex.push(pos);
  }
}

export function untrackPosition(id: string): void {
  const i = monitorIndex.findIndex((p) => p.id === id);
  if (i >= 0) monitorIndex.splice(i, 1);
}

export function getMonitoredPositions(): Position[] {
  return monitorIndex.filter((p) => p.status === 'OPEN');
}

export function openPosition(input: {
  userId: number;
  mint: string;
  symbol: string;
  entryPrice: number;
  quantity: number;
  entrySol: number;
  takeProfitPct: number;
  stopLossPct: number;
  mode: TradeMode;
  entrySignature?: string;
}): Position {
  const id = randomUUID();
  const pos: Position = {
    id,
    userId: input.userId,
    mint: input.mint,
    symbol: input.symbol,
    entryPrice: input.entryPrice,
    quantity: input.quantity,
    entrySol: input.entrySol,
    currentPrice: input.entryPrice,
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    takeProfitPct: input.takeProfitPct,
    stopLossPct: input.stopLossPct,
    mode: input.mode,
    status: 'OPEN',
    openedAt: Date.now(),
    entrySignature: input.entrySignature,
  };
  positions.set(id, pos);
  trackPosition(pos);
  return pos;
}

export function getOpenPositions(
  userId: number,
  mode?: TradeMode
): Position[] {
  return [...positions.values()].filter(
    (p) =>
      p.userId === userId &&
      p.status === 'OPEN' &&
      (mode == null || p.mode === mode)
  );
}

export function getPosition(id: string): Position | undefined {
  return positions.get(id);
}

export function closePosition(
  id: string,
  exitPrice: number
): Position | null {
  const pos = positions.get(id);
  if (!pos || pos.status !== 'OPEN') return null;

  const valueNow = pos.quantity * exitPrice;
  const pnl = valueNow - pos.entrySol;
  const pnlPct =
    pos.entryPrice > 0
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
      : 0;

  pos.status = 'CLOSED';
  pos.closedAt = Date.now();
  pos.currentPrice = exitPrice;
  pos.unrealizedPnl = pnl;
  pos.unrealizedPnlPct = pnlPct;
  positions.set(id, pos);
  untrackPosition(id);
  return pos;
}

export async function refreshPositions(userId: number): Promise<Position[]> {
  const open = getOpenPositions(userId);
  for (const pos of open) {
    const market = await getMarketData(pos.mint);
    if (market.priceUsd != null) {
      pos.currentPrice = market.priceUsd;
      const valueNow = pos.quantity * pos.currentPrice;
      pos.unrealizedPnl = valueNow - pos.entrySol;
      pos.unrealizedPnlPct =
        pos.entryPrice > 0
          ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : 0;
      positions.set(pos.id, pos);
    }
  }
  return getOpenPositions(userId);
}

export function countOpen(userId: number, mode?: TradeMode): number {
  return getOpenPositions(userId, mode).length;
}
