/**
 * Wallet engine — create, import, balance, encrypted storage.
 * Private keys NEVER logged. Stored encrypted in persist DB (Postgres/file).
 */

import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { encryptPrivateKey, decryptPrivateKey } from '../utils/crypto.js';
import { env } from '../config/env.js';
import {
  loadWallet,
  saveWallet,
  deleteWallet as dbDeleteWallet,
  allWallets,
  getBackend,
  forceFlush,
} from '../db/persist.js';
import {
  getConnection,
  getSolBalance,
  getTokenAccountsByOwner,
  confirmSignature,
  getLatestBlockhash,
} from './rpc.js';
import type { WalletInfo } from '../types/trading.js';

type StoredWallet = {
  userId: number;
  publicKey: string;
  encryptedSecret: string;
  createdAt: number;
};

const walletCache = new Map<number, StoredWallet>();

function getStored(userId: number): StoredWallet | undefined {
  let w = walletCache.get(userId);
  if (w) return w;
  const fromDb = loadWallet(userId);
  if (!fromDb) return undefined;
  w = fromDb;
  walletCache.set(userId, w);
  return w;
}

function putStored(w: StoredWallet): void {
  walletCache.set(w.userId, w);
  saveWallet(w);
}

function getSecret(): string {
  return env.WALLET_ENCRYPTION_SECRET;
}

export async function createWallet(
  userId: number
): Promise<{ publicKey: string; secretKeyBase58: string }> {
  const kp = Keypair.generate();
  const secretKey = bs58.encode(kp.secretKey);
  const encryptedSecret = encryptPrivateKey(secretKey, getSecret());

  if (getBackend() === 'memory') {
    throw new Error(
      'Storage is MEMORY-ONLY. Set DATABASE_URL (Postgres) or mount a volume at /data before creating wallets. Funds would be lost on redeploy.'
    );
  }

  putStored({
    userId,
    publicKey: kp.publicKey.toBase58(),
    encryptedSecret,
    createdAt: Date.now(),
  });
  await forceFlush();

  return { publicKey: kp.publicKey.toBase58(), secretKeyBase58: secretKey };
}

export async function importWallet(
  userId: number,
  secretKeyBase58: string
): Promise<{ publicKey: string }> {
  let kp: Keypair;
  try {
    const bytes = bs58.decode(secretKeyBase58.trim());
    kp = Keypair.fromSecretKey(bytes);
  } catch {
    throw new Error('Invalid private key format');
  }

  if (getBackend() === 'memory') {
    throw new Error(
      'Storage is MEMORY-ONLY. Set DATABASE_URL or mount /data volume before importing wallets.'
    );
  }

  const encryptedSecret = encryptPrivateKey(secretKeyBase58.trim(), getSecret());
  putStored({
    userId,
    publicKey: kp.publicKey.toBase58(),
    encryptedSecret,
    createdAt: Date.now(),
  });
  await forceFlush();

  return { publicKey: kp.publicKey.toBase58() };
}

export function hasWallet(userId: number): boolean {
  return getStored(userId) != null;
}

export function getPublicKey(userId: number): string | null {
  return getStored(userId)?.publicKey ?? null;
}

function loadKeypair(userId: number): Keypair {
  const stored = getStored(userId);
  if (!stored) throw new Error('Wallet not found');
  const secret = decryptPrivateKey(stored.encryptedSecret, getSecret());
  const bytes = bs58.decode(secret);
  return Keypair.fromSecretKey(bytes);
}

export async function getWalletInfo(userId: number): Promise<WalletInfo | null> {
  const stored = getStored(userId);
  if (!stored) return null;

  try {
    const balanceSol = await getSolBalance(stored.publicKey);
    let tokenBalances: WalletInfo['tokenBalances'] = [];
    try {
      const accounts = await getTokenAccountsByOwner(stored.publicKey);
      tokenBalances = accounts
        .filter((a) => a.uiAmount > 0)
        .map((a) => ({
          mint: a.mint,
          amount: a.amount,
          uiAmount: a.uiAmount,
        }));
    } catch {
      /* optional */
    }

    return {
      publicKey: stored.publicKey,
      balanceSol,
      tokenBalances,
    };
  } catch {
    throw new Error('Failed to fetch wallet balance (RPC error)');
  }
}

export async function withdrawSol(
  userId: number,
  toAddress: string,
  amountSol: number
): Promise<{ signature: string }> {
  if (amountSol <= 0) throw new Error('Invalid amount');
  let to: PublicKey;
  try {
    to = new PublicKey(toAddress);
  } catch {
    throw new Error('Invalid destination address');
  }

  const kp = loadKeypair(userId);
  const conn = getConnection();
  const balance = await getSolBalance(kp.publicKey.toBase58());
  const feeBuffer = 0.005;
  if (amountSol + feeBuffer > balance) {
    throw new Error('Insufficient SOL balance');
  }

  const { blockhash } = await getLatestBlockhash();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: to,
      lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
    })
  );
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;
  tx.sign(kp);

  const signature = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  const conf = await confirmSignature(signature);
  if (!conf.confirmed) {
    throw new Error('Withdrawal transaction failed to confirm');
  }

  return { signature };
}

export function exportPrivateKeySecure(userId: number): string {
  const stored = getStored(userId);
  if (!stored) throw new Error('Wallet not found');
  return decryptPrivateKey(stored.encryptedSecret, getSecret());
}

export function _internalLoadKeypair(userId: number): Keypair {
  return loadKeypair(userId);
}

export function listAllWallets(): StoredWallet[] {
  return allWallets();
}

export function removeWallet(userId: number): void {
  walletCache.delete(userId);
  dbDeleteWallet(userId);
}
