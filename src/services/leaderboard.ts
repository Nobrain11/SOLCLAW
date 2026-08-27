/**
 * Leaderboard from trade history + open unrealized PnL.
 * Periods: daily | weekly | all
 */

import { getAllHistoryRecords } from './history.js';
import { getAllOpenPositions } from './positions.js';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'all';

export type LeaderboardEntry = {
  userId: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  trades: number;
  volumeSol: number;
  wins: number;
  losses: number;
};

function periodStart(period: LeaderboardPeriod): number {
  const now = Date.now();
  if (period === 'daily') return now - 24 * 60 * 60 * 1000;
  if (period === 'weekly') return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

export function buildLeaderboard(
  period: LeaderboardPeriod = 'all',
  limit = 10
): LeaderboardEntry[] {
  const since = periodStart(period);
  const hist = getAllHistoryRecords().filter((h) => h.timestamp >= since);

  const map = new Map<number, LeaderboardEntry>();

  for (const h of hist) {
    let e = map.get(h.userId);
    if (!e) {
      e = {
        userId: h.userId,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        trades: 0,
        volumeSol: 0,
        wins: 0,
        losses: 0,
      };
      map.set(h.userId, e);
    }
    e.trades += 1;
    e.volumeSol += Math.abs(h.valueSol);
    if (h.pnlSol != null) {
      e.realizedPnl += h.pnlSol;
      if (h.pnlSol >= 0) e.wins += 1;
      else e.losses += 1;
    }
  }

  const opens = getAllOpenPositions();
  for (const p of opens) {
    let e = map.get(p.userId);
    if (!e) {
      e = {
        userId: p.userId,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        trades: 0,
        volumeSol: 0,
        wins: 0,
        losses: 0,
      };
      map.set(p.userId, e);
    }
    e.unrealizedPnl += p.unrealizedPnl;
  }

  const list = Array.from(map.values()).map((e) => ({
    ...e,
    totalPnl: e.realizedPnl + e.unrealizedPnl,
  }));

  list.sort((a, b) => b.totalPnl - a.totalPnl);
  return list.slice(0, limit);
}

export function formatLeaderboardMessage(
  period: LeaderboardPeriod,
  entries: LeaderboardEntry[],
  viewerId?: number
): string {
  const title =
    period === 'daily'
      ? '🏆 <b>LEADERBOARD — 24h</b>'
      : period === 'weekly'
        ? '🏆 <b>LEADERBOARD — 7d</b>'
        : '🏆 <b>LEADERBOARD — All time</b>';

  if (entries.length === 0) {
    return `${title}\n\nNo trades yet. Be the first.`;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = entries.map((e, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const sign = e.totalPnl >= 0 ? '+' : '';
    const you = viewerId && e.userId === viewerId ? ' ← you' : '';
    const wr =
      e.trades > 0
        ? ` · WR ${Math.round((e.wins / Math.max(e.wins + e.losses, 1)) * 100)}%`
        : '';
    return (
      `${medal} <code>${String(e.userId).slice(-6)}</code>  ` +
      `<b>${sign}${e.totalPnl.toFixed(3)}</b> SOL` +
      `${wr}${you}`
    );
  });

  return `${title}\n\n${lines.join('\n')}`;
}
