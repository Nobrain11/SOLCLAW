/**
 * Web trade routes — real executeTrade + wallet ops.
 */

import type { Express, Request, Response } from 'express';
import * as wallet from '../../services/wallet.js';
import { executeTrade } from '../../services/trading.js';
import { refreshPositions, countOpen } from '../../services/positions.js';
import { getPnlStats } from '../../services/history.js';
import { isValidPublicKey } from '../../services/rpc.js';
import { computeTradeFee } from '../../services/fees.js';
import { creditCashback, creditReferralToUser } from '../../services/rewards.js';
import { getSolPrice } from '../../services/solPrice.js';
import {
  getOrCreateSession,
  getSession,
  updateWebSession,
  type WebSession,
} from '../session.js';

const COOKIE = 'solclaw_sid';

function readSid(req: Request): string | undefined {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m?.[1];
}

function setSid(res: Response, sid: string): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
  );
}

function sessionFromReq(req: Request, res: Response): WebSession {
  const ref =
    (typeof req.query.ref === 'string' ? req.query.ref : undefined) ||
    (typeof req.body?.ref === 'string' ? req.body.ref : undefined);
  const s = getOrCreateSession(readSid(req), ref);
  if (!readSid(req) || readSid(req) !== s.sessionId) {
    setSid(res, s.sessionId);
  }
  return s;
}

export function registerTradeRoutes(app: Express): void {
  app.post('/api/session', (req, res) => {
    const s = sessionFromReq(req, res);
    res.json({
      ok: true,
      userId: s.userId,
      paper: s.paper,
      buySize: s.buySize,
      hasWallet: wallet.hasWallet(s.userId),
    });
  });

  app.get('/api/portfolio', async (req, res) => {
    const s = sessionFromReq(req, res);
    try {
      const info = await wallet.getWalletInfo(s.userId);
      const open = countOpen(s.userId);
      const stats = getPnlStats(s.userId);
      res.json({
        ok: true,
        balanceSol: info?.balanceSol ?? 0,
        address: info?.publicKey ?? null,
        openPositions: open,
        realizedPnl: stats.realizedPnl,
        paper: s.paper,
        hasWallet: wallet.hasWallet(s.userId),
      });
    } catch {
      res.json({
        ok: true,
        balanceSol: 0,
        address: null,
        openPositions: 0,
        realizedPnl: 0,
        paper: s.paper,
        hasWallet: wallet.hasWallet(s.userId),
      });
    }
  });

  app.post('/api/wallet/create', async (req, res) => {
    const s = sessionFromReq(req, res);
    try {
      if (wallet.hasWallet(s.userId)) {
        res.json({ ok: true, publicKey: wallet.getPublicKey(s.userId), existing: true });
        return;
      }
      const { publicKey } = await wallet.createWallet(s.userId);
      res.json({ ok: true, publicKey, existing: false });
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: e instanceof Error ? e.message : 'create failed',
      });
    }
  });

  app.post('/api/wallet/import', async (req, res) => {
    const s = sessionFromReq(req, res);
    const secret = String(req.body?.secret || '').trim();
    if (!secret) {
      res.status(400).json({ ok: false, error: 'secret required' });
      return;
    }
    try {
      const { publicKey } = await wallet.importWallet(s.userId, secret);
      res.json({ ok: true, publicKey });
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: e instanceof Error ? e.message : 'import failed',
      });
    }
  });

  app.post('/api/settings', (req, res) => {
    const s = sessionFromReq(req, res);
    const patch: { paper?: boolean; buySize?: number } = {};
    if (typeof req.body?.paper === 'boolean') patch.paper = req.body.paper;
    if (typeof req.body?.buySize === 'number' && req.body.buySize > 0 && req.body.buySize < 100) {
      patch.buySize = req.body.buySize;
    }
    updateWebSession(s.sessionId, patch);
    const next = getSession(s.sessionId)!;
    res.json({ ok: true, paper: next.paper, buySize: next.buySize });
  });

  app.get('/api/positions', async (req, res) => {
    const s = sessionFromReq(req, res);
    try {
      const open = await refreshPositions(s.userId);
      res.json({
        ok: true,
        positions: open.map((p) => ({
          id: p.id,
          mint: p.mint,
          symbol: p.symbol,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          unrealizedPnl: p.unrealizedPnl,
          sizeSol: p.quantity * p.currentPrice,
          mode: p.mode,
        })),
      });
    } catch {
      res.json({ ok: true, positions: [] });
    }
  });

  app.post('/api/trade', async (req, res) => {
    const s = sessionFromReq(req, res);
    const mint = String(req.body?.mint || '').trim();
    const side = String(req.body?.side || '').toUpperCase() as 'BUY' | 'SELL';
    const confirm = req.body?.confirm === true;
    const amountSol = Number(req.body?.amountSol ?? s.buySize);
    const percentage = Number(req.body?.percentage ?? 100);

    if (!confirm) {
      res.status(400).json({ ok: false, error: 'confirm:true required' });
      return;
    }
    if (!mint || !isValidPublicKey(mint)) {
      res.status(400).json({ ok: false, error: 'invalid mint' });
      return;
    }
    if (side !== 'BUY' && side !== 'SELL') {
      res.status(400).json({ ok: false, error: 'side must be BUY or SELL' });
      return;
    }
    if (side === 'BUY' && (!(amountSol > 0) || amountSol > 50)) {
      res.status(400).json({ ok: false, error: 'invalid amount' });
      return;
    }
    if (!wallet.hasWallet(s.userId) && !s.paper) {
      res.status(400).json({
        ok: false,
        error: 'Create or import a wallet first (or enable paper mode)',
      });
      return;
    }

    const mode = s.paper ? 'PAPER' : 'LIVE';

    try {
      const result = await executeTrade({
        userId: s.userId,
        chatId: s.userId,
        mint,
        side,
        amountSol: side === 'BUY' ? amountSol : undefined,
        percentage: side === 'SELL' ? percentage : undefined,
        slippageBps: 100,
        takeProfitPct: 50,
        stopLossPct: -20,
        mode,
      });

      if (result.state === 'CONFIRMED') {
        const value =
          side === 'BUY' ? result.inAmount ?? amountSol : result.outAmount ?? 0;
        const fee = computeTradeFee({
          side,
          valueSol: value,
          realizedPnlSol: null,
        });
        try {
          const sol = await getSolPrice();
          const px = sol.priceUsd ?? 0;
          if (fee.feeSol > 0) {
            creditCashback({
              userId: s.userId,
              feeSol: fee.feeSol,
              solPriceUsd: px,
              tradeId: result.signature,
            });
            const refNum = Number(s.ref);
            if (Number.isFinite(refNum) && refNum > 0 && refNum !== s.userId) {
              creditReferralToUser({
                referrerId: refNum,
                feeSol: fee.feeSol,
                solPriceUsd: px,
                tradeId: result.signature,
                traderUserId: s.userId,
              });
            }
          }
        } catch {
          /* soft */
        }

        res.json({
          ok: true,
          state: 'CONFIRMED',
          mode,
          signature: result.signature ?? null,
          inAmount: result.inAmount ?? null,
          outAmount: result.outAmount ?? null,
          price: result.price ?? null,
          fee: {
            bps: fee.feeBps,
            sol: fee.feeSol,
            line:
              fee.feeBps === 0
                ? 'Fee: 0% (loss / break-even / buy)'
                : `Fee: ${(fee.feeBps / 100).toFixed(2)}%`,
          },
        });
        return;
      }

      res.json({
        ok: false,
        state: result.state ?? 'FAILED',
        error: result.error ?? 'Trade failed',
        mode,
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        state: 'FAILED',
        error: e instanceof Error ? e.message : 'trade error',
      });
    }
  });
}
