/**
 * Solana RPC connection and helpers.
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  type Commitment,
} from '@solana/web3.js';
import { env } from '../config/env.js';

let connection: Connection | null = null;

export function getConnection(commitment: Commitment = 'confirmed'): Connection {
  if (!connection) {
    connection = new Connection(env.SOLANA_RPC_URL, {
      commitment,
      confirmTransactionInitialTimeout: 60_000,
    });
  }
  return connection;
}

export function isValidPublicKey(address: string): boolean {
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes()) || true;
  } catch {
    return false;
  }
}

export async function getSolBalance(publicKey: string): Promise<number> {
  const conn = getConnection();
  const pk = new PublicKey(publicKey);
  const lamports = await conn.getBalance(pk, 'confirmed');
  return lamports / LAMPORTS_PER_SOL;
}

export async function getLatestBlockhash() {
  const conn = getConnection();
  return conn.getLatestBlockhash('confirmed');
}

export async function confirmSignature(
  signature: string,
  timeoutMs = 60_000
): Promise<{ confirmed: boolean; err?: unknown }> {
  const conn = getConnection();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await conn.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    const v = status?.value;
    if (v) {
      if (v.err) {
        return { confirmed: false, err: v.err };
      }
      if (
        v.confirmationStatus === 'confirmed' ||
        v.confirmationStatus === 'finalized'
      ) {
        return { confirmed: true };
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { confirmed: false, err: 'confirmation_timeout' };
}

export async function getTokenAccountsByOwner(owner: string) {
  const conn = getConnection();
  const pk = new PublicKey(owner);
  const TOKEN_PROGRAM_ID = new PublicKey(
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  );
  const res = await conn.getParsedTokenAccountsByOwner(pk, {
    programId: TOKEN_PROGRAM_ID,
  });
  return res.value.map((v) => {
    const info = v.account.data.parsed.info;
    return {
      mint: info.mint as string,
      amount: Number(info.tokenAmount.amount),
      uiAmount: Number(info.tokenAmount.uiAmount ?? 0),
      decimals: Number(info.tokenAmount.decimals),
    };
  });
}
