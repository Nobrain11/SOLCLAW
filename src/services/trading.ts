/**
 * Live + paper trading executor.
 * LIVE: pump.fun curve (on-curve) OR Jupiter (graduated).
 * Never reports success without confirmation.
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { TradeRequest, TradeResult } from '../types/trading.js';
import { checkTradeRisk } from './risk.js';
import { scanToken } from './scanner.js';
import { paperBuy, paperSell } from './paper.js';
import {
  getOpenPositions,
  openPosition,
  closePosition,
  trackPosition,
} from './positions.js';
import { recordTrade } from './history.js';
import { getQuote, getSwapTransaction, WSOL } from './jupiter.js';
import { isOnPumpCurve, executePumpTrade } from './pumpTrade.js';
import { getPublicKey, _internalLoadKeypair } from './wallet.js';
import { getConnection, confirmSignature } from './rpc.js';
import { sendWithJitoFallback } from './jito.js';
import { getMarketData } from './market.js';

export async function executeTrade(req: TradeRequest): Promise<TradeResult> {
  if (req.mode === 'PAPER') return executePaper(req);
  return executeLive(req);
}

async function executePaper(req: TradeRequest): Promise<TradeResult> {
  if (req.side === 'BUY') {
    if (req.amountSol == null || req.amountSol <= 0) {
      return { state: 'FAILED', error: 'Invalid amount', mode: 'PAPER' };
    }
    const { result, position } = await paperBuy({
      userId: req.userId,
      mint: req.mint,
      amountSol: req.amountSol,
      takeProfitPct: req.takeProfitPct,
      stopLossPct: req.stopLossPct,
    });
    if (position) trackPosition(position);
    return result;
  }
  const open = getOpenPositions(req.userId, 'PAPER').filter((p) => p.mint === req.mint);
  if (open.length === 0) {
    return { state: 'FAILED', error: 'No paper position', mode: 'PAPER' };
  }
  const { result } = await paperSell({
    userId: req.userId,
    positionId: open[0].id,
    percentage: req.percentage ?? 100,
  });
  return result;
}

async function executeLive(req: TradeRequest): Promise<TradeResult> {
  const analysis = await scanToken(req.mint);
  const amountSol = req.amountSol ?? 0;

  if (req.side === 'BUY') {
    const risk = await checkTradeRisk({
      userId: req.userId,
      amountSol,
      mode: 'LIVE',
      token: analysis,
      slippageBps: req.slippageBps,
    });
    if (!risk.allowed) {
      return { state: 'FAILED', error: risk.reason, mode: 'LIVE' };
    }

    const userPk = getPublicKey(req.userId);
    if (!userPk) {
      return { state: 'FAILED', error: 'Trading wallet unavailable', mode: 'LIVE' };
    }

    try {
      const kp = _internalLoadKeypair(req.userId);
      const slipPct = Math.max(1, Math.round((req.slippageBps ?? 1000) / 100));
      let signature: string | undefined;
      let quantity = 0;
      let price = 0;

      const onCurve = await isOnPumpCurve(req.mint).catch(() => false);
      if (onCurve) {
        const pump = await executePumpTrade({
          userPublicKey: userPk,
          keypair: kp,
          mint: req.mint,
          side: 'BUY',
          amount: amountSol,
          denominatedInSol: true,
          slippagePct: slipPct,
        });
        if (!pump.ok || !pump.signature) {
          return {
            state: 'FAILED',
            error: pump.error || 'Pump.fun buy failed',
            signature: pump.signature,
            mode: 'LIVE',
          };
        }
        signature = pump.signature;
        const market = await getMarketData(req.mint);
        price = market.priceUsd ?? 0;
        quantity = price > 0 ? amountSol / Math.max(price, 1e-18) : 0;
      } else {
        const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
        const quote = await getQuote({
          inputMint: WSOL,
          outputMint: req.mint,
          amount: lamports,
          slippageBps: req.slippageBps,
        });
        const tx = await getSwapTransaction({ quote, userPublicKey: userPk });
        tx.sign([kp]);
        const conn = getConnection();
        signature = await sendWithJitoFallback(conn, tx.serialize());
        const conf = await confirmSignature(signature, 90_000);
        if (!conf.confirmed) {
          return {
            state: 'FAILED',
            error: 'Transaction failed to confirm',
            signature,
            mode: 'LIVE',
          };
        }
        const outAmount = Number(quote.outAmount);
        const decimals = analysis.decimals || 9;
        quantity = outAmount / 10 ** decimals;
        const market = await getMarketData(req.mint);
        price = market.priceUsd ?? amountSol / Math.max(quantity, 1e-12);
      }

      const position = openPosition({
        userId: req.userId,
        mint: req.mint,
        symbol: analysis.symbol,
        entryPrice: price,
        quantity,
        entrySol: amountSol,
        takeProfitPct: req.takeProfitPct ?? 50,
        stopLossPct: req.stopLossPct ?? -20,
        mode: 'LIVE',
        entrySignature: signature,
      });
      trackPosition(position);
      recordTrade({
        userId: req.userId,
        mint: req.mint,
        symbol: analysis.symbol,
        side: 'BUY',
        amount: quantity,
        price,
        valueSol: amountSol,
        mode: 'LIVE',
        signature,
      });
      return {
        state: 'CONFIRMED',
        signature,
        inAmount: amountSol,
        outAmount: quantity,
        price,
        mode: 'LIVE',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      return { state: 'FAILED', error: msg, mode: 'LIVE' };
    }
  }

  // LIVE SELL
  const open = getOpenPositions(req.userId, 'LIVE').filter((p) => p.mint === req.mint);
  if (open.length === 0) {
    return { state: 'FAILED', error: 'No live position', mode: 'LIVE' };
  }
  const pos = open[0];
  const pct = Math.min(100, Math.max(1, req.percentage ?? 100)) / 100;
  const sellQty = pos.quantity * pct;
  const decimals = analysis.decimals || 9;
  const atomic = Math.floor(sellQty * 10 ** decimals);
  if (atomic <= 0) {
    return { state: 'FAILED', error: 'Sell amount too small', mode: 'LIVE' };
  }

  const userPk = getPublicKey(req.userId);
  if (!userPk) {
    return { state: 'FAILED', error: 'Trading wallet unavailable', mode: 'LIVE' };
  }

  try {
    const kp = _internalLoadKeypair(req.userId);
    const slipPct = Math.max(1, Math.round((req.slippageBps ?? 1000) / 100));
    let signature: string | undefined;
    let valueSol = 0;

    const onCurve = await isOnPumpCurve(req.mint).catch(() => false);
    if (onCurve) {
      const pump = await executePumpTrade({
        userPublicKey: userPk,
        keypair: kp,
        mint: req.mint,
        side: 'SELL',
        amount: sellQty,
        denominatedInSol: false,
        slippagePct: slipPct,
      });
      if (!pump.ok || !pump.signature) {
        return {
          state: 'FAILED',
          error: pump.error || 'Pump.fun sell failed',
          signature: pump.signature,
          mode: 'LIVE',
        };
      }
      signature = pump.signature;
      valueSol = pos.entrySol * pct;
    } else {
      const quote = await getQuote({
        inputMint: req.mint,
        outputMint: WSOL,
        amount: atomic,
        slippageBps: req.slippageBps,
      });
      const tx = await getSwapTransaction({ quote, userPublicKey: userPk });
      tx.sign([kp]);
      const conn = getConnection();
      signature = await sendWithJitoFallback(conn, tx.serialize());
      const conf = await confirmSignature(signature, 90_000);
      if (!conf.confirmed) {
        return {
          state: 'FAILED',
          error: 'Sell failed to confirm',
          signature,
          mode: 'LIVE',
        };
      }
      valueSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
    }

    const market = await getMarketData(req.mint);
    const exitPrice = market.priceUsd ?? pos.currentPrice;
    const costBasis = pos.entrySol * pct;
    const pnlSol = valueSol - costBasis;
    const pnlPct =
      pos.entryPrice > 0 ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;

    if (pct >= 0.999) closePosition(pos.id, exitPrice);
    else {
      pos.quantity -= sellQty;
      pos.entrySol -= costBasis;
    }

    recordTrade({
      userId: req.userId,
      mint: req.mint,
      symbol: pos.symbol,
      side: 'SELL',
      amount: sellQty,
      price: exitPrice,
      valueSol,
      pnlSol,
      pnlPct,
      mode: 'LIVE',
      signature,
    });

    return {
      state: 'CONFIRMED',
      signature,
      inAmount: sellQty,
      outAmount: valueSol,
      price: exitPrice,
      mode: 'LIVE',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sell failed';
    return { state: 'FAILED', error: msg, mode: 'LIVE' };
  }
}
