/**
 * SOL CLAW — Live Web Trading Terminal
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSolPrice, formatSolHeader } from '../services/solPrice.js';
import {
  getTrendingTokens,
  getNewPumpPairs,
  getPumpMovers,
} from '../services/trending.js';
import { isValidPublicKey } from '../services/rpc.js';
import { registerTradeRoutes } from './api/trade.js';
import { registerHunterRoutes } from './api/hunter.js';
import { userCount, getBackend } from '../db/persist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || process.env.WEB_PORT || 3000);
const APP_URL = process.env.APP_URL || process.env.WEBSITE_URL || '';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

registerTradeRoutes(app);
registerHunterRoutes(app);

/** Live SOL/USD price */
app.get('/api/sol-price', async (_req, res) => {
  try {
    const snap = await getSolPrice();
    res.json({
      ok: true,
      priceUsd: snap.priceUsd,
      price: snap.priceUsd,
      change24h: snap.change24h,
      header: formatSolHeader(snap),
      updatedAt: snap.updatedAt,
    });
  } catch {
    res.status(502).json({ ok: false, error: 'price unavailable' });
  }
});

/** Trending = pump.fun movers */
app.get('/api/trending', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 16, 24);
    const force = req.query.refresh === '1';
    const items = await getPumpMovers(limit, force);
    res.json({
      ok: true,
      count: items.length,
      updatedAt: Date.now(),
      tokens: items.map((t) => ({
        mint: t.mint,
        name: t.name,
        symbol: t.symbol,
        priceUsd: t.priceUsd,
        marketCap: t.marketCap,
        volume24h: t.volume24h,
        change24h: t.change24h,
        liquidity: t.liquidity,
        source: t.source,
        url: t.url,
        image: t.image ?? null,
        createdAt: t.createdAt ?? null,
        progressPct: t.progressPct ?? null,
        dex: 'Pump.fun',
      })),
    });
  } catch {
    res.status(502).json({ ok: false, error: 'trending unavailable', tokens: [] });
  }
});

/**
 * Terminal feed tabs (pump.fun only):
 * - trending / movers → activity movers
 * - top → highest market cap
 * - surge → biggest % change
 * - pulse / new → newest created pairs
 */
app.get('/api/terminal', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 30);
    const tab = String(req.query.tab || 'trending');
    const force = req.query.refresh === '1';
    const { enrichTerminalToken } = await import('../services/tokenMeta.js');

    let items;
    if (tab === 'pulse' || tab === 'new' || tab === 'newpairs') {
      items = await getNewPumpPairs(limit, force);
    } else if (tab === 'trending' || tab === 'movers') {
      items = await getPumpMovers(limit, force);
    } else if (tab === 'surge') {
      items = await getTrendingTokens(limit * 2, force);
      items = [...items]
        .filter((i) => i.source === 'pump')
        .sort((a, b) => (b.change24h ?? -999) - (a.change24h ?? -999));
    } else if (tab === 'top') {
      items = await getTrendingTokens(limit * 2, force);
      items = [...items]
        .filter((i) => i.source === 'pump')
        .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    } else {
      items = await getPumpMovers(limit, force);
    }

    const tokens = await Promise.all(
      items.slice(0, limit).map((t) =>
        enrichTerminalToken({
          mint: t.mint,
          name: t.name,
          symbol: t.symbol,
          priceUsd: t.priceUsd,
          marketCap: t.marketCap,
          volume24h: t.volume24h,
          change24h: t.change24h,
          liquidity: t.liquidity,
          source: t.source,
          url: t.url,
          image: t.image ?? null,
          createdAt: t.createdAt ?? null,
        })
      )
    );
    res.json({
      ok: true,
      tab,
      count: tokens.length,
      updatedAt: Date.now(),
      tokens,
    });
  } catch (e) {
    console.error('[terminal]', e);
    res.status(502).json({ ok: false, error: 'terminal feed unavailable', tokens: [] });
  }
});

app.get('/api/token/:mint', async (req, res) => {
  const mint = req.params.mint?.trim();
  if (!mint || !isValidPublicKey(mint)) {
    res.status(400).json({ ok: false, error: 'invalid mint' });
    return;
  }
  try {
    const { getTokenDetail } = await import('../services/tokenDetail.js');
    const detail = await getTokenDetail(mint);
    res.json({ ok: true, ...detail });
  } catch (e) {
    console.error('[token]', e);
    res.status(502).json({ ok: false, error: 'token detail unavailable' });
  }
});

app.get('/api/ref/capture', (req, res) => {
  const ref = String(req.query.ref || '').slice(0, 64);
  if (ref && ref !== 'self') {
    res.cookie('solclaw_ref', ref, {
      maxAge: 30 * 24 * 3600 * 1000,
      httpOnly: true,
      sameSite: 'lax',
    });
  }
  res.json({ ok: true, ref: ref || null });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'SOL CLAW',
    mode: 'web-terminal',
    users: userCount(),
    db: getBackend(),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    appUrl: APP_URL,
    product: 'SOL CLAW',
    trendingRefreshMs: 10_000,
  });
});

app.get(['/', '/trade/:mint', '/rewards', '/hunter'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[solclaw] web terminal listening on 0.0.0.0:${PORT}`);
});
