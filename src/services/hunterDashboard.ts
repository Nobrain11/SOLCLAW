/**
 * Auto-Hunter dashboard snapshot for web terminal.
 */

import {
  getHunter,
  mergeHunterSettings,
  HUNTER_DEFAULTS,
  type HunterSettings,
  type HunterLog,
} from './autoHunter.js';
import { getOpenPositions } from './positions.js';
import type { TradeMode } from '../types/trading.js';

export type HunterCandidateView = {
  at: number;
  mint: string;
  ticker: string;
  ageSec: number | null;
  status: 'SCANNING' | 'FILTERING' | 'READY' | 'REJECTED' | 'ENTERED';
  reasons: string[];
};

const candidateFeed = new Map<number, HunterCandidateView[]>();

export function recordHunterCandidate(
  userId: number,
  c: Omit<HunterCandidateView, 'at'> & { at?: number }
): void {
  const list = candidateFeed.get(userId) ?? [];
  list.unshift({
    at: c.at ?? Date.now(),
    mint: c.mint,
    ticker: c.ticker,
    ageSec: c.ageSec,
    status: c.status,
    reasons: (c.reasons ?? []).slice(0, 6),
  });
  if (list.length > 24) list.length = 24;
  candidateFeed.set(userId, list);
}

export type HunterDashboard = {
  enabled: boolean;
  status: 'OFF' | 'HUNTING' | 'LOCKED' | 'KILLED' | 'PAUSED';
  mode: TradeMode;
  dailyPnlSol: number;
  dailyLossSol: number;
  dailyLossCap: number;
  entriesHour: number;
  maxEntriesHour: number;
  entriesToday: number;
  maxEntriesDay: number;
  exposureSol: number;
  maxExposurePct: number;
  openAutoPositions: number;
  marketRegime: 'NORMAL' | 'COLD' | 'HOT' | 'UNKNOWN';
  regimeSuccessPct: number | null;
  lastScanAt: number;
  settings: HunterSettings;
  logs: Array<{
    at: number;
    kind: string;
    ticker: string;
    mint?: string;
    message: string;
    pnlSol?: number;
  }>;
  candidates: HunterCandidateView[];
};

function fromLogs(logs: HunterLog[]): HunterCandidateView[] {
  const out: HunterCandidateView[] = [];
  for (const l of logs.slice(0, 16)) {
    if (!l.mint) continue;
    let status: HunterCandidateView['status'] = 'FILTERING';
    if (l.kind === 'entry') status = 'ENTERED';
    else if (l.kind === 'skip') status = 'REJECTED';
    else if (l.kind === 'status') continue;
    out.push({
      at: l.at,
      mint: l.mint,
      ticker: l.ticker,
      ageSec: null,
      status,
      reasons: [l.message],
    });
  }
  return out;
}

export function getHunterDashboard(userId: number): HunterDashboard {
  const s = getHunter(userId);
  const settings = mergeHunterSettings(s?.settings ?? null);
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  if (!s) {
    return {
      enabled: false,
      status: 'OFF',
      mode: 'PAPER',
      dailyPnlSol: 0,
      dailyLossSol: 0,
      dailyLossCap: settings.dailyLossCap,
      entriesHour: 0,
      maxEntriesHour: settings.maxEntriesPerHour,
      entriesToday: 0,
      maxEntriesDay: settings.maxEntriesPerDay,
      exposureSol: 0,
      maxExposurePct: settings.maxExposurePercent,
      openAutoPositions: 0,
      marketRegime: 'UNKNOWN',
      regimeSuccessPct: null,
      lastScanAt: 0,
      settings,
      logs: [],
      candidates: [],
    };
  }

  const entriesHour = (s.entryTimes || []).filter((t) => t >= hourAgo).length;
  const open = getOpenPositions(s.userId, s.mode);
  const exposureSol = open.reduce((a, p) => a + p.entrySol, 0);

  let dailyPnl = 0;
  for (const l of s.logs) {
    if (l.kind === 'exit' && typeof l.pnlSol === 'number') {
      const day = new Date(l.at).toISOString().slice(0, 10);
      if (day === s.dailyKey) dailyPnl += l.pnlSol;
    }
  }

  const recent = s.logs.filter((l) => l.at >= hourAgo);
  const entries = recent.filter((l) => l.kind === 'entry').length;
  const skips = recent.filter((l) => l.kind === 'skip').length;
  const total = entries + skips;
  let regimeSuccessPct: number | null = null;
  let marketRegime: HunterDashboard['marketRegime'] = 'UNKNOWN';
  if (total >= 5) {
    regimeSuccessPct = (entries / total) * 100;
    if (regimeSuccessPct < 5) marketRegime = 'COLD';
    else if (regimeSuccessPct > 20) marketRegime = 'HOT';
    else marketRegime = 'NORMAL';
  }

  let status: HunterDashboard['status'] = 'OFF';
  if (s.dailyLoss >= settings.dailyLossCap) status = 'LOCKED';
  else if (s.enabled) status = 'HUNTING';

  const fed = candidateFeed.get(userId) ?? [];
  const candidates = fed.length > 0 ? fed : fromLogs(s.logs);

  return {
    enabled: s.enabled,
    status,
    mode: s.mode,
    dailyPnlSol: dailyPnl,
    dailyLossSol: s.dailyLoss,
    dailyLossCap: settings.dailyLossCap,
    entriesHour,
    maxEntriesHour: settings.maxEntriesPerHour,
    entriesToday: s.dailyEntries,
    maxEntriesDay: settings.maxEntriesPerDay,
    exposureSol,
    maxExposurePct: settings.maxExposurePercent,
    openAutoPositions: open.length,
    marketRegime,
    regimeSuccessPct,
    lastScanAt: s.lastScanAt,
    settings,
    logs: s.logs.slice(0, 10).map((l) => ({
      at: l.at,
      kind: l.kind,
      ticker: l.ticker,
      mint: l.mint,
      message: l.message,
      pnlSol: l.pnlSol,
    })),
    candidates,
  };
}

export { HUNTER_DEFAULTS };
