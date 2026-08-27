/**
 * Jupiter quote + swap transaction builder (v6 API).
 * Works for pump.fun graduated tokens with Jupiter routes.
 */

import { VersionedTransaction } from '@solana/web3.js';
import { env } from '../config/env.js';

const WSOL = 'So11111111111111111111111111111111111111112';

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  otherAmountThreshold: string;
  swapMode: string;
  routePlan?: unknown;
  raw: Record<string, unknown>;
};

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}): Promise<JupiterQuote> {
  const url = new URL(`${env.JUPITER_QUOTE_API}/quote`);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', String(params.amount));
  url.searchParams.set('slippageBps', String(params.slippageBps));
  url.searchParams.set('onlyDirectRoutes', 'false');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jupiter quote failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.outAmount) {
    throw new Error('Jupiter returned no route');
  }
  return {
    inputMint: String(data.inputMint),
    outputMint: String(data.outputMint),
    inAmount: String(data.inAmount),
    outAmount: String(data.outAmount),
    priceImpactPct: Number(data.priceImpactPct ?? 0),
    otherAmountThreshold: String(data.otherAmountThreshold ?? data.outAmount),
    swapMode: String(data.swapMode ?? 'ExactIn'),
    routePlan: data.routePlan,
    raw: data,
  };
}

export async function getSwapTransaction(params: {
  quote: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}): Promise<VersionedTransaction> {
  const res = await fetch(`${env.JUPITER_QUOTE_API}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      quoteResponse: params.quote.raw,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jupiter swap build failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { swapTransaction?: string };
  if (!json.swapTransaction) {
    throw new Error('Jupiter did not return swapTransaction');
  }
  const buf = Buffer.from(json.swapTransaction, 'base64');
  return VersionedTransaction.deserialize(buf);
}

export { WSOL };
