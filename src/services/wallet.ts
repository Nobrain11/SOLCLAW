/**
 * Wallet engine — create, import, balance, encrypted storage.
 * Private keys are NEVER logged or returned to Telegram layers.
 */

import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { encryptPrivateKey, decryptPrivateKey } from '../utils/crypto.js';
import { env } from '../config/env.js';
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

const walletStore = new Map<number, StoredWallet>();

function getSecret(): string {
  return env.WALLET_ENCRYPTION_SECRET;
}

export async function createWallet(userId: number): Promise<{ publicKey: string }> {
  const kp = Keypair.generate();
  const secretKey = bs58.encode(kp.secretKey);
  const encryptedSecret = encryptPrivateKey(secretKey, getSecret());

  walletStore.set(userId, {
    userId,
    publicKey: kp.publicKey.toBase58(),
    encryptedSecret,
    createdAt: Date.now(),
  });

  return { publicKey: kp.publicKey.toBase58() };
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

  const encryptedSecret = encryptPrivateKey(secretKeyBase58.trim(), getSecret());
  walletStore.set(userId, {
    userId,
    publicKey: kp.publicKey.toBase58(),
    encryptedSecret,
    createdAt: Date.now(),
  });

  return { publicKey: kp.publicKey.toBase58() };
}

export function hasWallet(userId: number): boolean {
  return walletStore.has(userId);
}

export function getPublicKey(userId: number): string | null {
  return walletStore.get(userId)?.publicKey ?? null;
}

function loadKeypair(userId: number): Keypair {
  const stored = walletStore.get(userId);
  if (!stored) {
    throw new Error('Wallet not found');
  }
  const secret = decryptPrivateKey(stored.encryptedSecret, getSecret());
  const bytes = bs58.decode(secret);
  return Keypair.fromSecretKey(bytes);
}

export async function getWalletInfo(userId: number): Promise<WalletInfo | null> {
  const stored = walletStore.get(userId);
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
  const stored = walletStore.get(userId);
  if (!stored) throw new Error('Wallet not found');
  return decryptPrivateKey(stored.encryptedSecret, getSecret());
}

export function _internalLoadKeypair(userId: number): Keypair {
  return loadKeypair(userId);
}
