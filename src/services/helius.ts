/**
 * Helius-backed discovery for new pump.fun curve tokens.
 */

import { Connection, PublicKey } from '@solana/web3.js';

export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export type NewPumpToken = {
  mint: string;
  signature?: string;
  slot?: number;
  seenAt: number;
  source: 'helius' | 'rpc' | 'pump_api';
};

const recent = new Map<string, NewPumpToken>();
const MAX_RECENT = 80;

function heliusRpcUrl(): string | null {
  const key = process.env.HELIUS_API_KEY?.trim();
  if (!key) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

function getConnection(): Connection {
  const url =
    heliusRpcUrl() ||
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com';
  return new Connection(url, 'confirmed');
}

function remember(t: NewPumpToken): void {
  if (recent.has(t.mint)) return;
  recent.set(t.mint, t);
  if (recent.size > MAX_RECENT) {
    const oldest = [...recent.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt)[0];
    if (oldest) recent.delete(oldest[0]);
  }
}

function extractMintsFromLogs(logs: string[]): string[] {
  const out: string[] = [];
  const re = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
  for (const line of logs) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const s = m[1];
      if (s === PUMP_PROGRAM_ID) continue;
      if (s.length >= 32 && s.length <= 44) out.push(s);
    }
  }
  return [...new Set(out)];
}

export async function pollNewPumpTokens(limit = 12): Promise<NewPumpToken[]> {
  try {
    const conn = getConnection();
    const programId = new PublicKey(PUMP_PROGRAM_ID);
    const sigs = await conn.getSignaturesForAddress(programId, { limit: 20 });
    const found: NewPumpToken[] = [];
    const source = heliusRpcUrl() ? 'helius' : 'rpc';

    for (const sig of sigs.slice(0, limit)) {
      try {
        const tx = await conn.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta?.logMessages) continue;
        const mints = extractMintsFromLogs(tx.meta.logMessages);
        const msg = tx.transaction.message as {
          getAccountKeys?: () => { toBase58(): string }[] | PublicKey[];
          accountKeys?: { toBase58(): string }[];
        };
        const keys = msg.getAccountKeys?.() ?? msg.accountKeys;
        if (keys && Array.isArray(keys)) {
          for (const k of keys) {
            const s =
              typeof k === 'string'
                ? k
                : (k as { toBase58(): string }).toBase58?.() ?? '';
            if (s.length >= 32 && s !== PUMP_PROGRAM_ID) mints.push(s);
          }
        }
        for (const mint of [...new Set(mints)].slice(0, 3)) {
          if (recent.has(mint)) continue;
          const token: NewPumpToken = {
            mint,
            signature: sig.signature,
            slot: sig.slot,
            seenAt: Date.now(),
            source,
          };
          remember(token);
          found.push(token);
        }
      } catch {
        /* skip */
      }
    }
    return found;
  } catch (e) {
    console.warn('[helius] poll failed', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function discoverPumpCandidates(limit = 16): Promise<NewPumpToken[]> {
  const out: NewPumpToken[] = [];
  const seen = new Set<string>();

  try {
    const urls = [
      'https://frontend-api-v3.pump.fun/coins?offset=0&limit=24&sort=last_trade_timestamp&order=DESC&includeNsfw=false',
      'https://frontend-api-v3.pump.fun/coins?offset=0&limit=16&sort=created_timestamp&order=DESC&includeNsfw=false',
    ];
    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://pump.fun',
          Referer: 'https://pump.fun/',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) continue;
      for (const raw of data) {
        const c = raw as Record<string, unknown>;
        const mint = String(c.mint ?? '');
        if (mint.length < 32 || seen.has(mint)) continue;
        if (c.complete === true) continue;
        seen.add(mint);
        const token: NewPumpToken = {
          mint,
          seenAt: Date.now(),
          source: 'pump_api',
        };
        remember(token);
        out.push(token);
        if (out.length >= limit) return out;
      }
    }
  } catch {
    /* */
  }

  const polled = await pollNewPumpTokens(8);
  for (const t of polled) {
    if (seen.has(t.mint)) continue;
    seen.add(t.mint);
    out.push(t);
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}

export function getRecentDiscovered(): NewPumpToken[] {
  return [...recent.values()].sort((a, b) => b.seenAt - a.seenAt);
}

export function hasHelius(): boolean {
  return !!process.env.HELIUS_API_KEY?.trim();
}
