/**
 * Paper trading — real market prices, no on-chain txs.
 * Clearly labeled PAPER. Never mixed with LIVE positions.
 */

import { scanToken } from './scanner.js';
import { getMarketData } from './market.js';
import { getSolPrice } from './solPrice.js';
import {
  openPosition,
  closePosition,
  getOpenPositions,
  trackPosition,
} from './positions.js';
import { recordTrade } from './history.js';
import { checkTradeRisk } from './risk.js';
import type { Position, TradeResult } from '../types/trading.js';

async function resolvePriceUsd(mint: string): Promise<number | null> {
  const market = await getMarketData(mint).catch(() => null);
  if (market?.priceUsd != null && market.priceUsd > 0) return market.priceUsd;
  const analysis = await scanToken(mint).catch(() => null);
  if (analysis?.price != null && analysis.price > 0) return analysis.price;
  return null;
}

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
    return {
      result: { state: 'FAILED', error: risk.reason, mode: 'PAPER' },
    };
  }

  const price = (await resolvePriceUsd(input.mint)) ?? analysis.price;
  if (price == null || price <= 0) {
    return {
      result: {
        state: 'FAILED',
        error: 'Market data unavailable. Trade blocked.',
        mode: 'PAPER',
      },
    };
  }

  const sol = await getSolPrice();
  const solUsd = sol.priceUsd && sol.priceUsd > 0 ? sol.priceUsd : 150;
  // tokens received ≈ (SOL spent * SOL/USD) / token USD price
  const quantity = (input.amountSol * solUsd) / price;

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
      result: {
        state: 'FAILED',
        error: 'Paper position not found',
        mode: 'PAPER',
      },
    };
  }

  const pct = Math.min(100, Math.max(1, input.percentage)) / 100;
  const sellQty = pos.quantity * pct;

  const price =
    (await resolvePriceUsd(pos.mint)) ?? pos.currentPrice ?? pos.entryPrice;
  if (price == null || price <= 0) {
    return {
      result: {
        state: 'FAILED',
        error: 'Market data unavailable for sell',
        mode: 'PAPER',
      },
    };
  }

  const sol = await getSolPrice();
  const solUsd = sol.priceUsd && sol.priceUsd > 0 ? sol.priceUsd : 150;
  const valueSol = (sellQty * price) / solUsd;
  const costBasis = pos.entrySol * pct;
  const pnlSol = valueSol - costBasis;
  const pnlPct =
    pos.entryPrice > 0
      ? ((price - pos.entryPrice) / pos.entryPrice) * 100
      : 0;

  if (pct >= 0.999) {
    closePosition(pos.id, price);
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
    price,
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
      price,
      mode: 'PAPER',
    },
    position: pos,
  };
}
