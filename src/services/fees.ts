/**
 * Dynamic trading fees + referral revenue accounting.
 * Fee = 0 on break-even / loss; configured bps on profit.
 */

import { env } from '../config/env.js';

export type FeeResult = {
  grossSol: number;
  feeBps: number;
  feeSol: number;
  netSol: number;
  isProfitable: boolean;
  referralShareSol: number;
  platformShareSol: number;
};

export function computeTradeFee(opts: {
  side: 'BUY' | 'SELL';
  valueSol: number;
  realizedPnlSol: number | null;
}): FeeResult {
  const gross = Math.abs(opts.valueSol);
  const profitBps = Number(env.PROFIT_FEE_BPS || '100');
  const platformFeeBps = Number(env.PLATFORM_FEE_BPS || '100');
  const referralShareBps = Number(env.REFERRAL_SHARE_BPS || '6000');

  const isProfitable =
    opts.side === 'SELL' &&
    opts.realizedPnlSol != null &&
    opts.realizedPnlSol > 0;

  const feeBps = isProfitable ? profitBps || platformFeeBps : 0;
  const feeSol = isProfitable ? (gross * feeBps) / 10_000 : 0;
  const referralShareSol = (feeSol * referralShareBps) / 10_000;
  const platformShareSol = feeSol - referralShareSol;

  return {
    grossSol: gross,
    feeBps,
    feeSol,
    netSol: opts.side === 'SELL' ? gross - feeSol : gross,
    isProfitable,
    referralShareSol,
    platformShareSol,
  };
}

export function formatFeeLine(fee: FeeResult): string {
  if (fee.feeBps === 0) {
    return 'Fee: 0% (loss / break-even)';
  }
  return `Fee: ${(fee.feeBps / 100).toFixed(2)}% · ${fee.feeSol.toFixed(6)} SOL`;
}
