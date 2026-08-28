/**
 * TP / SL background monitor.
 */

import { getMarketData } from './market.js';
import {
  closePosition,
  getMonitoredPositions,
  untrackPosition,
} from './positions.js';
import { executeTrade } from './trading.js';
import { recordTrade } from './history.js';
import type { Position } from '../types/trading.js';

export type TpslHit = {
  position: Position;
  kind: 'TP' | 'SL';
  exitPrice: number;
  pnlPct: number;
};

type AlertFn = (chatId: number, text: string) => Promise<void>;

const closedGuard = new Set<string>();

export async function evaluateTpsl(): Promise<TpslHit[]> {
  const hits: TpslHit[] = [];
  const open = getMonitoredPositions();

  for (const pos of open) {
    if (closedGuard.has(pos.id)) continue;
    try {
      const market = await getMarketData(pos.mint);
      if (market.priceUsd == null) continue;

      const price = market.priceUsd;
      pos.currentPrice = price;
      const pnlPct =
        pos.entryPrice > 0
          ? ((price - pos.entryPrice) / pos.entryPrice) * 100
          : 0;
      pos.unrealizedPnlPct = pnlPct;
      pos.unrealizedPnl = pos.quantity * price - pos.entrySol;

      let kind: 'TP' | 'SL' | null = null;
      if (pos.takeProfitPct > 0 && pnlPct >= pos.takeProfitPct) kind = 'TP';
      else if (pos.stopLossPct < 0 && pnlPct <= pos.stopLossPct) kind = 'SL';

      if (kind) {
        closedGuard.add(pos.id);
        hits.push({ position: pos, kind, exitPrice: price, pnlPct });
      }
    } catch {
      /* skip */
    }
  }
  return hits;
}

export async function processHits(
  hits: TpslHit[],
  alert?: AlertFn
): Promise<void> {
  for (const hit of hits) {
    const pos = hit.position;
    try {
      if (pos.mode === 'PAPER') {
        closePosition(pos.id, hit.exitPrice);
        recordTrade({
          userId: pos.userId,
          mint: pos.mint,
          symbol: pos.symbol,
          side: 'SELL',
          quantity: pos.quantity,
          price: hit.exitPrice,
          valueSol: pos.quantity * hit.exitPrice,
          pnlSol: pos.quantity * hit.exitPrice - pos.entrySol,
          pnlPct: hit.pnlPct,
          mode: 'PAPER',
        });
      } else {
        await executeTrade({
          userId: pos.userId,
          chatId: 0,
          mint: pos.mint,
          side: 'SELL',
          percentage: 100,
          slippageBps: 100,
          mode: 'LIVE',
        });
      }
      untrackPosition(pos.id);

      if (alert) {
        const emoji =
          hit.kind === 'TP' ? '🎯 TAKE PROFIT HIT' : '🛑 STOP LOSS HIT';
        const sign = hit.pnlPct >= 0 ? '+' : '';
        const text =
          `${emoji}\n\n` +
          `🐱 <b>${pos.symbol}</b> [${pos.mode}]\n\n` +
          `Entry: $${pos.entryPrice}\n` +
          `Exit: $${hit.exitPrice}\n` +
          `PnL: ${sign}${hit.pnlPct.toFixed(1)}%`;
        await alert(pos.userId, text).catch(() => undefined);
      }
    } catch {
      closedGuard.delete(pos.id);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startTpslMonitor(
  alert?: AlertFn,
  intervalMs = 20_000
): void {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const hits = await evaluateTpsl();
      if (hits.length) await processHits(hits, alert);
    } catch {
      /* never crash */
    }
  }, intervalMs);
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref?.();
  }
}

export function stopTpslMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export { trackPosition } from './positions.js';
