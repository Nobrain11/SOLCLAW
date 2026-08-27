/**
 * Paper trading — real market prices, no on-chain txs.
 * Clearly labeled PAPER. Never mixed with LIVE positions.
 * pump.fun mints supported via market + scanner.
 */

import { scanToken } from './scanner.js';
import { getMarketData } from './market.js';
import { openPosition, closePosition, getOpenPositions, trackPosition } from './positions.js';
import { recordTrade } from './history.js';
import { checkTradeRisk } from './risk.js';
import type { Position, TradeResult } from '../types/trading.js';

export async function paperBuy(input: {
  userId: number;
  mint: string;
  amountSol: number;
  takeProfitPct?: number;
  stopLossPct?: number;
}): Promise<{ result: TradeResult; position?: Position }> {
  const analysis = await scanToken(input.mint);
  const risk = await checkTradeRisk({
    userId: input.userId,
    amountSol: input.amountSol,
    mode: 'PAPER',
    token: analysis,
  });
  if (!risk.allowed) {
    return { result: { state: 'FAILED', error: risk.reason, mode: 'PAPER' } };
  }

  const market = await getMarketData(input.mint);
  if (market.priceUsd == null) {
    return {
      result: {
        state: 'FAILED',
        error: 'Market data unavailable. Trade blocked.',
        mode: 'PAPER',
      },
    };
  }

  const price = market.priceUsd;
  const quantity = input.amountSol / price;

  const position = openPosition({
    userId: input.userId,
    mint: input.mint,
    symbol: analysis.symbol,
    entryPrice: price,
    quantity,
    entrySol: input.amountSol,
    takeProfitPct: input.takeProfitPct ?? 50,
    stopLossPct: input.stopLossPct ?? -20,
    mode: 'PAPER',
  });

  trackPosition(position);

  recordTrade({
    userId: input.userId,
    mint: input.mint,
    symbol: analysis.symbol,
    side: 'BUY',
    amount: quantity,
    price,
    valueSol: input.amountSol,
    mode: 'PAPER',
  });

  return {
    result: {
      state: 'CONFIRMED',
      inAmount: input.amountSol,
      outAmount: quantity,
      price,
      mode: 'PAPER',
    },
    position,
  };
}

export async function paperSell(input: {
  userId: number;
  positionId: string;
  percentage: number;
}): Promise<{ result: TradeResult; position?: Position }> {
  const open = getOpenPositions(input.userId, 'PAPER');
  const pos = open.find((p) => p.id === input.positionId);
  if (!pos) {
    return {
      result: { state: 'FAILED', error: 'Paper position not found', mode: 'PAPER' },
    };
  }

  const market = await getMarketData(pos.mint);
  if (market.priceUsd == null) {
    return {
      result: {
        state: 'FAILED',
        error: 'Market data unavailable. Trade blocked.',
        mode: 'PAPER',
      },
    };
  }

  const exitPrice = market.priceUsd;
  const pct = Math.min(100, Math.max(1, input.percentage)) / 100;
  const sellQty = pos.quantity * pct;
  const valueSol = sellQty * exitPrice;
  const costBasis = pos.entrySol * pct;
  const pnlSol = valueSol - costBasis;
  const pnlPct =
    pos.entryPrice > 0
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
      : 0;

  if (pct >= 0.999) {
    closePosition(pos.id, exitPrice);
  } else {
    pos.quantity -= sellQty;
    pos.entrySol -= costBasis;
  }

  recordTrade({
    userId: input.userId,
    mint: pos.mint,
    symbol: pos.symbol,
    side: 'SELL',
    amount: sellQty,
    price: exitPrice,
    valueSol,
    pnlSol,
    pnlPct,
    mode: 'PAPER',
  });

  return {
    result: {
      state: 'CONFIRMED',
      inAmount: sellQty,
      outAmount: valueSol,
      price: exitPrice,
      mode: 'PAPER',
    },
    position: pos,
  };
}
