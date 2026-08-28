/**
 * Auto-Hunter web API — status, enable, pause, kill.
 */

import type { Express, Request, Response } from 'express';
import {
  enableHunter,
  disableHunter,
  killHunter,
  startHunterLoop,
  hunterTick,
  getHunter,
} from '../../services/autoHunter.js';
import {
  getHunterDashboard,
  HUNTER_DEFAULTS,
} from '../../services/hunterDashboard.js';
import { hasWallet } from '../../services/wallet.js';
import { getOrCreateSession, type WebSession } from '../session.js';

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
  const s = getOrCreateSession(readSid(req));
  if (!readSid(req) || readSid(req) !== s.sessionId) {
    setSid(res, s.sessionId);
  }
  return s;
}

let loopStarted = false;

export function registerHunterRoutes(app: Express): void {
  if (!loopStarted) {
    startHunterLoop();
    loopStarted = true;
  }

  app.get('/api/hunter/status', (req, res) => {
    const s = sessionFromReq(req, res);
    const dash = getHunterDashboard(s.userId);
    res.json({
      ok: true,
      userId: s.userId,
      walletConnected: hasWallet(s.userId),
      paper: s.paper,
      defaults: HUNTER_DEFAULTS,
      ...dash,
    });
  });

  app.post('/api/hunter/enable', async (req, res) => {
    const s = sessionFromReq(req, res);
    if (req.body?.confirm !== true) {
      res.status(400).json({
        ok: false,
        error: 'confirm_required',
        message:
          'Auto-Hunter trades automatically. Daily cap 0.5 SOL. Risk of loss. Send confirm:true.',
      });
      return;
    }
    if (!hasWallet(s.userId)) {
      res.status(400).json({
        ok: false,
        error: 'wallet_required',
        message: 'Create a wallet in Portfolio before enabling Auto-Hunter.',
      });
      return;
    }
    const mode = s.paper ? 'PAPER' : 'LIVE';
    const result = enableHunter(s.userId, s.userId, mode);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.reason });
      return;
    }
    void hunterTick(s.userId);
    res.json({ ok: true, status: getHunterDashboard(s.userId) });
  });

  app.post('/api/hunter/pause', (req, res) => {
    const s = sessionFromReq(req, res);
    disableHunter(s.userId);
    res.json({ ok: true, status: getHunterDashboard(s.userId) });
  });

  app.post('/api/hunter/kill', (req, res) => {
    const s = sessionFromReq(req, res);
    killHunter(s.userId);
    res.json({ ok: true, status: getHunterDashboard(s.userId) });
  });

  app.post('/api/hunter/tick', async (req, res) => {
    const s = sessionFromReq(req, res);
    const h = getHunter(s.userId);
    if (!h?.enabled) {
      res.json({ ok: true, messages: [], status: getHunterDashboard(s.userId) });
      return;
    }
    const messages = await hunterTick(s.userId);
    res.json({ ok: true, messages, status: getHunterDashboard(s.userId) });
  });
}
