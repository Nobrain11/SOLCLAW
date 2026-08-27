/**
 * Referral rewards + cashback accounting.
 */

import { getUserReferral } from './referral.js';

export type RewardBucket = {
  unclaimedUsd: number;
  claimedUsd: number;
  unclaimedSol: number;
  claimedSol: number;
};

export type UserRewards = {
  userId: number;
  tier: string;
  cashbackPct: number;
  referralPct: number;
  referralCount: number;
  referral: RewardBucket;
  cashback: RewardBucket;
};

type LedgerEntry = {
  id: string;
  userId: number;
  referrerId?: number;
  type: 'referral' | 'cashback';
  amountSol: number;
  amountUsd: number;
  tradeId?: string;
  claimed: boolean;
  createdAt: number;
};

const ledger: LedgerEntry[] = [];

function defaults(userId: number): UserRewards {
  return {
    userId,
    tier: 'X1 — Novice',
    cashbackPct: 5,
    referralPct: 60,
    referralCount: 0,
    referral: { unclaimedUsd: 0, claimedUsd: 0, unclaimedSol: 0, claimedSol: 0 },
    cashback: { unclaimedUsd: 0, claimedUsd: 0, unclaimedSol: 0, claimedSol: 0 },
  };
}

export function creditCashback(opts: {
  userId: number;
  feeSol: number;
  solPriceUsd: number;
  tradeId?: string;
}): void {
  if (opts.feeSol <= 0) return;
  const sol = opts.feeSol * 0.05;
  const usd = sol * (opts.solPriceUsd || 0);
  ledger.push({
    id: `cb_${Date.now()}_${opts.userId}`,
    userId: opts.userId,
    type: 'cashback',
    amountSol: sol,
    amountUsd: usd,
    tradeId: opts.tradeId,
    claimed: false,
    createdAt: Date.now(),
  });
}

export function creditReferralToUser(opts: {
  referrerId: number;
  feeSol: number;
  solPriceUsd: number;
  tradeId?: string;
  traderUserId: number;
}): void {
  if (opts.feeSol <= 0) return;
  const sol = opts.feeSol * 0.6;
  const usd = sol * (opts.solPriceUsd || 0);
  ledger.push({
    id: `rf_${Date.now()}_${opts.referrerId}`,
    userId: opts.referrerId,
    referrerId: opts.referrerId,
    type: 'referral',
    amountSol: sol,
    amountUsd: usd,
    tradeId: opts.tradeId,
    claimed: false,
    createdAt: Date.now(),
  });
  void opts.traderUserId;
  void getUserReferral;
}

export function getUserRewards(userId: number, referralCount = 0): UserRewards {
  const r = defaults(userId);
  r.referralCount = referralCount;
  for (const e of ledger) {
    if (e.userId !== userId) continue;
    const bucket = e.type === 'referral' ? r.referral : r.cashback;
    if (e.claimed) {
      bucket.claimedSol += e.amountSol;
      bucket.claimedUsd += e.amountUsd;
    } else {
      bucket.unclaimedSol += e.amountSol;
      bucket.unclaimedUsd += e.amountUsd;
    }
  }
  return r;
}

export function claimAll(userId: number): { claimedSol: number; claimedUsd: number } {
  let claimedSol = 0;
  let claimedUsd = 0;
  for (const e of ledger) {
    if (e.userId !== userId || e.claimed) continue;
    e.claimed = true;
    claimedSol += e.amountSol;
    claimedUsd += e.amountUsd;
  }
  return { claimedSol, claimedUsd };
}

export function formatRewardsMessage(r: UserRewards, botUsername?: string): string {
  const link = botUsername
    ? `https://t.me/${botUsername}?start=r_${r.userId}`
    : `https://t.me/YOUR_BOT?start=r_${r.userId}`;
  const totalUn = r.referral.unclaimedSol + r.cashback.unclaimedSol;
  const totalCl = r.referral.claimedSol + r.cashback.claimedSol;

  return (
    `🎁 <b>REWARDS HUB</b>\n\n` +
    `🎖️ Tier: ${r.tier}\n\n` +
    `💸 Cashback: ${r.cashbackPct}%\n` +
    `🔗 Referral: ${r.referralPct}%\n\n` +
    `👥 Referrals: ${r.referralCount}\n\n` +
    `<b>REFERRAL</b>\n` +
    `💰 Unclaimed: ${r.referral.unclaimedSol.toFixed(4)} SOL\n` +
    `✅ Claimed: ${r.referral.claimedSol.toFixed(4)} SOL\n\n` +
    `<b>CASHBACK</b>\n` +
    `💰 Unclaimed: ${r.cashback.unclaimedSol.toFixed(4)} SOL\n` +
    `✅ Claimed: ${r.cashback.claimedSol.toFixed(4)} SOL\n\n` +
    `<b>TOTAL</b>\n` +
    `💰 Unclaimed: ${totalUn.toFixed(4)} SOL\n` +
    `✅ Claimed: ${totalCl.toFixed(4)} SOL\n\n` +
    `🔗 Your link:\n<code>${link}</code>`
  );
}
