/**
 * Auto-Hunter — pump.fun sentinel
 * OFF by default. Helius discovery + social gate + Jito fills.
 */

import { getTrendingTokens, type TrendingToken } from './trending.js';
import { scanToken } from './scanner.js';
import { getMarketData } from './market.js';
import { executeTrade } from './trading.js';
import { hasWallet, getWalletInfo } from './wallet.js';
import { getOpenPositions, closePosition } from './positions.js';
import { discoverQueue, applySocialFilter } from './hunterDiscover.js';
import type { TradeMode } from '../types/trading.js';

export type TpTier = { profit: number; sellPercent: number };

export type HunterSettings = {
  maxBuy: number;
  slippageBps: number;
  takeProfitTiers: TpTier[];
  stopLoss: number;
  trailingAfter: number;
  trailingPullback: number;
  timeStopMinutes: number;
  dailyLossCap: number;
  maxEntriesPerHour: number;
  maxEntriesPerDay: number;
  maxExposurePercent: number;
  minCurveSol: number;
  maxTop10Pct: number;
  minHolders: number;
};

export const HUNTER_DEFAULTS: HunterSettings = {
  maxBuy: 0.1,
  slippageBps: 2000,
  takeProfitTiers: [
    { profit: 40, sellPercent: 50 },
    { profit: 100, sellPercent: 25 },
    { profit: 200, sellPercent: 15 },
  ],
  stopLoss: 20,
  trailingAfter: 30,
  trailingPullback: 15,
  timeStopMinutes: 30,
  dailyLossCap: 0.5,
  maxEntriesPerHour: 3,
  maxEntriesPerDay: 10,
  maxExposurePercent: 25,
  minCurveSol: 0.5,
  maxTop10Pct: 35,
  minHolders: 20,
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

export function mergeHunterSettings(
  partial?: Partial<HunterSettings> | null
): HunterSettings {
  const p = partial ?? {};
  const tiers =
    Array.isArray(p.takeProfitTiers) && p.takeProfitTiers.length > 0
      ? p.takeProfitTiers
          .filter(
            (t) =>
              t &&
              isNum(t.profit) &&
              isNum(t.sellPercent) &&
              t.sellPercent > 0 &&
              t.sellPercent <= 100
          )
          .map((t) => ({ profit: t.profit, sellPercent: t.sellPercent }))
      : HUNTER_DEFAULTS.takeProfitTiers;

  return {
    maxBuy: isNum(p.maxBuy) && p.maxBuy > 0 ? p.maxBuy : HUNTER_DEFAULTS.maxBuy,
    slippageBps:
      isNum(p.slippageBps) && p.slippageBps > 0
        ? Math.min(p.slippageBps, 5000)
        : HUNTER_DEFAULTS.slippageBps,
    takeProfitTiers: tiers.length ? tiers : HUNTER_DEFAULTS.takeProfitTiers,
    stopLoss:
      isNum(p.stopLoss) && p.stopLoss > 0 ? p.stopLoss : HUNTER_DEFAULTS.stopLoss,
    trailingAfter:
      isNum(p.trailingAfter) && p.trailingAfter > 0
        ? p.trailingAfter
        : HUNTER_DEFAULTS.trailingAfter,
    trailingPullback:
      isNum(p.trailingPullback) && p.trailingPullback > 0
        ? p.trailingPullback
        : HUNTER_DEFAULTS.trailingPullback,
    timeStopMinutes:
      isNum(p.timeStopMinutes) && p.timeStopMinutes > 0
        ? p.timeStopMinutes
        : HUNTER_DEFAULTS.timeStopMinutes,
    dailyLossCap:
      isNum(p.dailyLossCap) && p.dailyLossCap > 0
        ? p.dailyLossCap
        : HUNTER_DEFAULTS.dailyLossCap,
    maxEntriesPerHour:
      isNum(p.maxEntriesPerHour) && p.maxEntriesPerHour > 0
        ? Math.floor(p.maxEntriesPerHour)
        : HUNTER_DEFAULTS.maxEntriesPerHour,
    maxEntriesPerDay:
      isNum(p.maxEntriesPerDay) && p.maxEntriesPerDay > 0
        ? Math.floor(p.maxEntriesPerDay)
        : HUNTER_DEFAULTS.maxEntriesPerDay,
    maxExposurePercent:
      isNum(p.maxExposurePercent) && p.maxExposurePercent > 0
        ? Math.min(p.maxExposurePercent, 100)
        : HUNTER_DEFAULTS.maxExposurePercent,
    minCurveSol:
      isNum(p.minCurveSol) && p.minCurveSol > 0
        ? p.minCurveSol
        : HUNTER_DEFAULTS.minCurveSol,
    maxTop10Pct:
      isNum(p.maxTop10Pct) && p.maxTop10Pct > 0
        ? p.maxTop10Pct
        : HUNTER_DEFAULTS.maxTop10Pct,
    minHolders:
      isNum(p.minHolders) && p.minHolders > 0
        ? Math.floor(p.minHolders)
        : HUNTER_DEFAULTS.minHolders,
  };
}

export type HunterLog = {
  at: number;
  kind: 'entry' | 'exit' | 'skip' | 'status' | 'lock';
  ticker: string;
  mint?: string;
  message: string;
  signature?: string;
  pnlSol?: number;
};

export type HunterState = {
  userId: number;
  chatId: number;
  enabled: boolean;
  mode: TradeMode;
  settings: HunterSettings;
  enteredMints: Set<string>;
  entryTimes: number[];
  dailyLoss: number;
  dailyKey: string;
  dailyEntries: number;
  logs: HunterLog[];
  lastScanAt: number;
  peakPnlPct: Map<string, number>;
  soldTiers: Map<string, Set<number>>;
};

const hunters = new Map<number, HunterState>();

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function getOrCreate(
  userId: number,
  chatId: number,
  mode: TradeMode = 'PAPER'
): HunterState {
  let s = hunters.get(userId);
  if (!s) {
    s = {
      userId,
      chatId,
      enabled: false,
      mode,
      settings: mergeHunterSettings(null),
      enteredMints: new Set(),
      entryTimes: [],
      dailyLoss: 0,
      dailyKey: utcDayKey(),
      dailyEntries: 0,
      logs: [],
      lastScanAt: 0,
      peakPnlPct: new Map(),
      soldTiers: new Map(),
    };
    hunters.set(userId, s);
  }
  const today = utcDayKey();
  if (s.dailyKey !== today) {
    s.dailyKey = today;
    s.dailyLoss = 0;
    s.dailyEntries = 0;
  }
  return s;
}

export function getHunter(userId: number): HunterState | undefined {
  return hunters.get(userId);
}

export function formatHunterStatus(userId: number): string {
  const s = hunters.get(userId);
  if (!s) return `⚡ Auto-Hunter OFF\nDefaults loaded. Confirm to arm.`;
  const st = s.settings;
  if (!s.enabled) {
    if (s.dailyLoss >= st.dailyLossCap) {
      return `⚡ Auto-Hunter LOCKED\nDaily loss cap ${st.dailyLossCap} SOL hit. Resets UTC midnight.`;
    }
    return `⚡ Auto-Hunter OFF\nMax buy ${st.maxBuy} SOL · SL -${st.stopLoss}% · Cap ${st.dailyLossCap} SOL/day`;
  }
  return `⚡ Auto-Hunter · Hunting…\nBuy ${st.maxBuy} · SL -${st.stopLoss}% · ${s.dailyEntries}/${st.maxEntriesPerDay} today`;
}

export function formatHunterLogs(userId: number, n = 10): string {
  const s = hunters.get(userId);
  if (!s || s.logs.length === 0) return `No hunter trades yet.`;
  return s.logs
    .slice(0, n)
    .map((l) => {
      const t = new Date(l.at).toISOString().slice(11, 16);
      return `${t} ${l.message}`;
    })
    .join('\n');
}

function pushLog(s: HunterState, log: HunterLog): void {
  s.logs.unshift(log);
  if (s.logs.length > 40) s.logs.length = 40;
}

export function killHunter(userId: number): void {
  const s = hunters.get(userId);
  if (!s) return;
  s.enabled = false;
  pushLog(s, {
    at: Date.now(),
    kind: 'status',
    ticker: '—',
    message: `🛑 Hunter killed. Idle.`,
  });
}

export type EnableResult =
  | { ok: true; state: HunterState }
  | { ok: false; reason: string };

export function enableHunter(
  userId: number,
  chatId: number,
  mode: TradeMode = 'PAPER'
): EnableResult {
  if (!hasWallet(userId)) {
    return { ok: false, reason: 'Connect a wallet first. Hunter stays OFF.' };
  }
  const s = getOrCreate(userId, chatId, mode);
  s.mode = mode;
  s.settings = mergeHunterSettings(s.settings);
  if (s.dailyLoss >= s.settings.dailyLossCap) {
    s.enabled = false;
    return {
      ok: false,
      reason: `Daily loss cap ${s.settings.dailyLossCap} SOL hit. Locked until next UTC day.`,
    };
  }
  s.enabled = true;
  pushLog(s, {
    at: Date.now(),
    kind: 'status',
    ticker: '—',
    message: `🟢 Hunter armed. Scanning pump.fun curve…`,
  });
  return { ok: true, state: s };
}

export function disableHunter(userId: number): void {
  const s = hunters.get(userId);
  if (!s) return;
  s.enabled = false;
  pushLog(s, {
    at: Date.now(),
    kind: 'status',
    ticker: '—',
    message: `⚪ Hunter OFF.`,
  });
}

async function runFilters(
  token: TrendingToken,
  settings: HunterSettings
): Promise<{ pass: boolean; ticker: string; reasons: string[]; boost: boolean }> {
  const ticker = token.symbol || '???';
  const reasons: string[] = [];
  let boost = false;

  if (token.source !== 'pump') reasons.push('not on pump curve');
  if (token.liquidity != null && token.liquidity < settings.minCurveSol) {
    reasons.push(`curve liq ${token.liquidity.toFixed(2)} < ${settings.minCurveSol}`);
  }

  let analysis;
  try {
    analysis = await scanToken(token.mint);
  } catch {
    return { pass: false, ticker, reasons: ['scan failed'], boost };
  }

  if (analysis.safetyLevel === 'HIGH_RISK' || (analysis.safetyScore ?? 0) < 40) {
    reasons.push(`rug screen ${analysis.safetyLevel ?? 'DANGER'}`);
  }
  if (analysis.warnings?.some((w) => /authority|freeze|mint/i.test(w))) {
    reasons.push('mint/freeze authority risk');
  }
  if (!analysis.tradable) reasons.push('not tradable');

  const volHeat =
    (token.volume24h ?? 0) > 5000 || (token.marketCap ?? 0) > 20_000;
  if (volHeat) {
    boost = true;
    reasons.push('volume heat');
  }

  try {
    const social = await applySocialFilter(token.mint, token.symbol, volHeat);
    if (!social.pass) reasons.push(social.reason);
    else {
      reasons.push(social.reason);
      if (social.boost) boost = true;
    }
  } catch {
    /* soft */
  }

  try {
    const m = await getMarketData(token.mint);
    if (m.liquidityUsd != null && m.liquidityUsd < 500) {
      reasons.push(`usd liq low`);
    }
  } catch {
    /* */
  }

  const hardFails = reasons.filter(
    (r) =>
      !r.includes('heat') &&
      !r.includes('social hot') &&
      !r.includes('social warm') &&
      !r.includes('filters clean')
  );
  const pass =
    hardFails.length === 0 &&
    (token.source === 'pump' || (token.liquidity ?? 0) > 0);
  return {
    pass,
    ticker,
    reasons: reasons.length ? reasons : ['filters clean'],
    boost,
  };
}

function canEnter(s: HunterState): string | null {
  if (!s.enabled) return 'hunter off';
  if (s.dailyLoss >= s.settings.dailyLossCap) {
    s.enabled = false;
    return 'daily loss cap';
  }
  if (s.dailyEntries >= s.settings.maxEntriesPerDay) return 'day entry cap';
  const hourAgo = Date.now() - 60 * 60 * 1000;
  s.entryTimes = s.entryTimes.filter((t) => t > hourAgo);
  if (s.entryTimes.length >= s.settings.maxEntriesPerHour) return 'hourly entry cap';
  return null;
}

async function tryEntry(
  s: HunterState,
  token: TrendingToken
): Promise<string | null> {
  if (s.enteredMints.has(token.mint)) return null;
  const block = canEnter(s);
  if (block) {
    if (block === 'daily loss cap') {
      pushLog(s, {
        at: Date.now(),
        kind: 'lock',
        ticker: '—',
        message: `🔒 Cap hit. Hunter locked till UTC day.`,
      });
    }
    return null;
  }

  const filt = await runFilters(token, s.settings);
  if (!filt.pass) {
    const why = filt.reasons.slice(0, 2).join(', ');
    const msg = `⏭️ Skipped $${filt.ticker} — ${why}. Not today.`;
    pushLog(s, {
      at: Date.now(),
      kind: 'skip',
      ticker: filt.ticker,
      mint: token.mint,
      message: msg,
    });
    return msg;
  }

  let balance = 0;
  try {
    balance = (await getWalletInfo(s.userId))?.balanceSol ?? 0;
  } catch {
    /* */
  }
  const open = getOpenPositions(s.userId, s.mode);
  const exposure = open.reduce((a, p) => a + p.entrySol, 0);
  const maxExp = (balance || 1) * (s.settings.maxExposurePercent / 100);
  if (exposure >= maxExp) {
    const msg = `⏭️ Skipped $${filt.ticker} — exposure cap.`;
    pushLog(s, {
      at: Date.now(),
      kind: 'skip',
      ticker: filt.ticker,
      mint: token.mint,
      message: msg,
    });
    return msg;
  }

  const size = filt.boost
    ? Math.min(s.settings.maxBuy * 2, 0.2)
    : s.settings.maxBuy;
  const result = await executeTrade({
    userId: s.userId,
    chatId: s.chatId,
    mint: token.mint,
    side: 'BUY',
    amountSol: size,
    slippageBps: s.settings.slippageBps,
    takeProfitPct: s.settings.takeProfitTiers[0]?.profit ?? 40,
    stopLossPct: -s.settings.stopLoss,
    mode: s.mode,
  });

  if (result.state !== 'CONFIRMED') {
    const msg = `⏭️ Skipped $${filt.ticker} — fill failed.`;
    pushLog(s, {
      at: Date.now(),
      kind: 'skip',
      ticker: filt.ticker,
      mint: token.mint,
      message: msg,
    });
    return msg;
  }

  s.enteredMints.add(token.mint);
  s.entryTimes.push(Date.now());
  s.dailyEntries += 1;
  const msg = `🟢 Auto-buy $${filt.ticker} ${size} SOL — ${filt.reasons.slice(0, 2).join(', ')}. Slip ${Math.round(s.settings.slippageBps / 100)}%.`;
  pushLog(s, {
    at: Date.now(),
    kind: 'entry',
    ticker: filt.ticker,
    mint: token.mint,
    message: msg,
    signature: result.signature,
  });
  return msg;
}

async function manageExits(s: HunterState): Promise<string[]> {
  const msgs: string[] = [];
  const open = getOpenPositions(s.userId, s.mode);
  const st = s.settings;
  for (const pos of open) {
    const entry = pos.entryPrice || 0;
    const cur = pos.currentPrice || entry;
    if (entry <= 0) continue;
    const pnlPct = ((cur - entry) / entry) * 100;
    const peak = Math.max(s.peakPnlPct.get(pos.id) ?? pnlPct, pnlPct);
    s.peakPnlPct.set(pos.id, peak);

    if (pnlPct <= -st.stopLoss) {
      closePosition(pos.id, cur);
      s.dailyLoss += Math.abs(pos.entrySol * (pnlPct / 100));
      const msg = `🛑 Stop $${pos.symbol} — ${pnlPct.toFixed(0)}%. Full exit.`;
      pushLog(s, {
        at: Date.now(),
        kind: 'exit',
        ticker: pos.symbol,
        mint: pos.mint,
        message: msg,
        pnlSol: pos.entrySol * (pnlPct / 100),
      });
      msgs.push(msg);
      if (s.dailyLoss >= st.dailyLossCap) {
        s.enabled = false;
        pushLog(s, {
          at: Date.now(),
          kind: 'lock',
          ticker: '—',
          message: `🔒 Daily cap. Hunter OFF.`,
        });
      }
      continue;
    }

    const ageMin = (Date.now() - pos.openedAt) / 60_000;
    if (ageMin >= st.timeStopMinutes && pnlPct > -10 && pnlPct < 15) {
      closePosition(pos.id, cur);
      const msg = `⏰ Time-stop $${pos.symbol} — flat after ${st.timeStopMinutes}m.`;
      pushLog(s, {
        at: Date.now(),
        kind: 'exit',
        ticker: pos.symbol,
        mint: pos.mint,
        message: msg,
      });
      msgs.push(msg);
      continue;
    }

    if (peak >= st.trailingAfter && peak - pnlPct >= st.trailingPullback) {
      closePosition(pos.id, cur);
      const msg = `💎 Trail exit $${pos.symbol} — peak +${peak.toFixed(0)}%.`;
      pushLog(s, {
        at: Date.now(),
        kind: 'exit',
        ticker: pos.symbol,
        mint: pos.mint,
        message: msg,
      });
      msgs.push(msg);
      continue;
    }

    const sold = s.soldTiers.get(pos.id) ?? new Set<number>();
    for (const tier of st.takeProfitTiers) {
      if (sold.has(tier.profit)) continue;
      if (pnlPct >= tier.profit) {
        sold.add(tier.profit);
        s.soldTiers.set(pos.id, sold);
        const msg = `💎 Taking profit $${pos.symbol} — sold ${tier.sellPercent}% at +${tier.profit}%.`;
        pushLog(s, {
          at: Date.now(),
          kind: 'exit',
          ticker: pos.symbol,
          mint: pos.mint,
          message: msg,
        });
        msgs.push(msg);
        if (tier.profit >= 200 || sold.size >= st.takeProfitTiers.length) {
          closePosition(pos.id, cur);
        }
      }
    }
  }
  return msgs;
}

export async function hunterTick(userId: number): Promise<string[]> {
  const s = hunters.get(userId);
  if (!s || !s.enabled) return [];
  const today = utcDayKey();
  if (s.dailyKey !== today) {
    s.dailyKey = today;
    s.dailyLoss = 0;
    s.dailyEntries = 0;
  }
  if (s.dailyLoss >= s.settings.dailyLossCap) {
    s.enabled = false;
    return [`🔒 Cap hit. Hunter locked.`];
  }
  const out: string[] = [...(await manageExits(s))];
  try {
    const queue = await discoverQueue(8);
    for (const token of queue) {
      if (s.enteredMints.has(token.mint)) continue;
      const msg = await tryEntry(s, token);
      if (msg) out.push(msg);
      if (!s.enabled || canEnter(s)) break;
    }
  } catch {
    /* fallback trending only */
    try {
      const tokens = await getTrendingTokens(8, true);
      for (const token of tokens) {
        if (s.enteredMints.has(token.mint)) continue;
        const msg = await tryEntry(s, token);
        if (msg) out.push(msg);
        if (!s.enabled || canEnter(s)) break;
      }
    } catch {
      /* */
    }
  }
  s.lastScanAt = Date.now();
  return out;
}

let loopTimer: ReturnType<typeof setInterval> | null = null;

export function startHunterLoop(
  onMessage?: (chatId: number, text: string) => void
): void {
  if (loopTimer) return;
  loopTimer = setInterval(() => {
    void (async () => {
      for (const s of hunters.values()) {
        if (!s.enabled) continue;
        try {
          const msgs = await hunterTick(s.userId);
          if (onMessage) {
            for (const m of msgs.slice(0, 3)) onMessage(s.chatId, m);
          }
        } catch (e) {
          console.error('[hunter]', s.userId, e);
        }
      }
    })();
  }, 45_000);
}
