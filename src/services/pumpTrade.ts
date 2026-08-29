/**
 * Pump.fun curve buy/sell via PumpPortal trade-local (unsigned tx → we sign).
 * Used only while token is still on the bonding curve.
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
} from '@solana/web3.js';
import { getConnection, confirmSignature } from './rpc.js';
import { sendWithJitoFallback } from './jito.js';

const PORTAL = 'https://pumpportal.fun/api/trade-local';

export type PumpTradeParams = {
  userPublicKey: string;
  keypair: Keypair;
  mint: string;
  side: 'BUY' | 'SELL';
  /** SOL amount for BUY, or token amount for SELL when denominatedInSol=false */
  amount: number;
  denominatedInSol: boolean;
  slippagePct: number;
  priorityFeeSol?: number;
};

export type PumpTradeResult = {
  ok: boolean;
  signature?: string;
  error?: string;
};

async function buildLocalTx(body: Record<string, unknown>): Promise<Uint8Array> {
  const res = await fetch(PORTAL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PumpPortal ${res.status}: ${text.slice(0, 180)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 32) {
    throw new Error('PumpPortal returned empty transaction');
  }
  return buf;
}

export async function isOnPumpCurve(mint: string): Promise<boolean> {
  const bases = [
    `https://frontend-api-v3.pump.fun/coins/${mint}`,
    `https://frontend-api.pump.fun/coins/${mint}`,
  ];
  for (const url of bases) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://pump.fun',
          Referer: 'https://pump.fun/',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { complete?: boolean; mint?: string };
      if (j && (j.mint === mint || j.complete === false || j.complete === true)) {
        return j.complete === false;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function executePumpTrade(
  params: PumpTradeParams
): Promise<PumpTradeResult> {
  try {
    const action = params.side === 'BUY' ? 'buy' : 'sell';
    const body = {
      publicKey: params.userPublicKey,
      action,
      mint: params.mint,
      denominatedInSol: String(params.denominatedInSol),
      amount: params.amount,
      slippage: params.slippagePct,
      priorityFee: params.priorityFeeSol ?? 0.0005,
      pool: 'pump',
    };

    const raw = await buildLocalTx(body);
    const tx = VersionedTransaction.deserialize(raw);
    tx.sign([params.keypair]);

    const conn: Connection = getConnection();
    const signature = await sendWithJitoFallback(conn, Buffer.from(tx.serialize()));

    const conf = await confirmSignature(signature, 90_000);
    if (!conf.confirmed) {
      return {
        ok: false,
        signature,
        error: 'Pump trade submitted but not confirmed',
      };
    }
    return { ok: true, signature };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Pump trade failed',
    };
  }
}
