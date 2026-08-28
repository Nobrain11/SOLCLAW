/**
 * Jito block-engine send for higher landing rates.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';

const JITO_ENDPOINTS = [
  'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/transactions',
  'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions',
  'https://ny.mainnet.block-engine.jito.wtf/api/v1/transactions',
];

const TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4bVmkNKgBEACvFqvFGeTTB',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6E8dpDF1RYkVzub5TFiMwjA',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

export function jitoEnabled(): boolean {
  const v = process.env.JITO_ENABLED;
  if (v === '0' || v === 'false') return false;
  return true;
}

export function tipLamports(): number {
  const sol = Number(process.env.JITO_TIP_SOL ?? '0.0001');
  if (!Number.isFinite(sol) || sol <= 0) return 100_000;
  return Math.floor(sol * 1e9);
}

function randomTipAccount(): PublicKey {
  const i = Math.floor(Math.random() * TIP_ACCOUNTS.length);
  return new PublicKey(TIP_ACCOUNTS[i]);
}

export function buildTipInstruction(
  from: PublicKey,
  lamports = tipLamports()
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: from,
    toPubkey: randomTipAccount(),
    lamports,
  });
}

export async function sendViaJito(
  serializedBase64: string
): Promise<{ signature: string } | { error: string }> {
  const uuid = process.env.JITO_UUID?.trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (uuid) headers['x-jito-auth'] = uuid;

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [serializedBase64, { encoding: 'base64' }],
  });

  for (const url of JITO_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(12_000),
      });
      const json = (await res.json()) as {
        result?: string;
        error?: { message?: string };
      };
      if (json.result) return { signature: json.result };
      if (json.error?.message) console.warn('[jito]', url, json.error.message);
    } catch (e) {
      console.warn('[jito] fail', url, e instanceof Error ? e.message : e);
    }
  }
  return { error: 'Jito all endpoints failed' };
}

export async function sendWithJitoFallback(
  connection: Connection,
  raw: Uint8Array
): Promise<string> {
  if (jitoEnabled()) {
    const b64 = Buffer.from(raw).toString('base64');
    const j = await sendViaJito(b64);
    if ('signature' in j) return j.signature;
  }
  return connection.sendRawTransaction(raw, {
    skipPreflight: true,
    maxRetries: 3,
  });
}

export async function appendTipAndBuild(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[]
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const withTip = jitoEnabled()
    ? [...instructions, buildTipInstruction(payer.publicKey)]
    : instructions;
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: withTip,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}
