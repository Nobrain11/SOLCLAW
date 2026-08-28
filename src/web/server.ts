/**
 * SOL CLAW — Live Web Trading Terminal
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSolPrice, formatSolHeader } from '../services/solPrice.js';
import { getTrendingTokens } from '../services/trending.js';
import { scanToken } from '../services/scanner.js';
import { getMarketData } from '../services/market.js';
import { isValidPublicKey } from '../services/rpc.js';
import { registerTradeRoutes } from './api/trade.js';
import { userCount, getBackend } from '../db/persist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || process.env.WEB_PORT || 3000);
const APP_URL = process.env.APP_URL || process.env.WEBSITE_URL || '';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(publicDir));

registerTradeRoutes(app);

app.get('/api/sol-price', async (_req, res) => {
  try {
    const snap = await getSolPrice();
    res.json({
      ok: true,
      priceUsd: snap.priceUsd,
      change24h: snap.change24h,
      header: formatSolHeader(snap),
      updatedAt: snap.updatedAt,
    });
  } catch {
    res.status(502).json({ ok: false, error: 'price unavailable' });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 16, 24);
    const force = req.query.refresh === '1';
    const items = await getTrendingTokens(limit, force);
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
        dex: t.source === 'pump' ? 'Pump.fun' : 'Solana DEX',
      })),
    });
  } catch {
    res.status(502).json({ ok: false, error: 'trending unavailable', tokens: [] });
  }
});

app.get('/api/token/:mint', async (req, res) => {
  const mint = req.params.mint?.trim();
  if (!mint || !isValidPublicKey(mint)) {
    res.status(400).json({ ok: false, error: 'invalid mint' });
    return;
  }
  try {
    const [market, analysis] = await Promise.all([
      getMarketData(mint),
      scanToken(mint).catch(() => null),
    ]);
    res.json({
      ok: true,
      mint,
      name: analysis?.name ?? mint.slice(0, 8),
      symbol: analysis?.symbol ?? 'TOKEN',
      priceUsd: market.priceUsd ?? analysis?.price ?? null,
      marketCap: market.marketCap ?? analysis?.marketCap ?? null,
      liquidity: market.liquidityUsd ?? analysis?.liquidity ?? null,
      volume24h: market.volume24h ?? null,
      change24h: market.priceChange24h ?? analysis?.priceChange24h ?? null,
      dexId: market.dexId ?? null,
      safetyLevel: analysis?.safetyLevel ?? 'UNKNOWN',
      warnings: analysis?.warnings ?? [],
      available: market.available,
      updatedAt: Date.now(),
      sharePath: `/trade/${mint}`,
    });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : 'scan failed',
    });
  }
});

app.get('/api/ref/capture', (req, res) => {
  const ref = String(req.query.ref || '').slice(0, 64);
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

app.get(['/', '/trade/:mint', '/rewards'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[solclaw] web terminal listening on 0.0.0.0:${PORT}`);
});
