/**
 * Web session → numeric userId for shared wallet/trading engine.
 */

import { randomBytes } from 'node:crypto';

export type WebSession = {
  sessionId: string;
  userId: number;
  ref?: string;
  paper: boolean;
  buySize: number;
  createdAt: number;
  lastSeen: number;
};

const sessions = new Map<string, WebSession>();

function userIdFromSession(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (Math.imul(31, h) + sessionId.charCodeAt(i)) | 0;
  }
  return 2_000_000_000 + (Math.abs(h) % 900_000_000);
}

export function createSession(ref?: string): WebSession {
  const sessionId = randomBytes(24).toString('hex');
  const s: WebSession = {
    sessionId,
    userId: userIdFromSession(sessionId),
    ref: ref?.slice(0, 64),
    paper: true,
    buySize: 0.05,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  sessions.set(sessionId, s);
  return s;
}

export function getSession(sessionId: string | undefined): WebSession | null {
  if (!sessionId) return null;
  const s = sessions.get(sessionId);
  if (!s) return null;
  s.lastSeen = Date.now();
  return s;
}

export function getOrCreateSession(
  sessionId: string | undefined,
  ref?: string
): WebSession {
  const existing = getSession(sessionId);
  if (existing) {
    if (ref && !existing.ref) existing.ref = ref.slice(0, 64);
    return existing;
  }
  return createSession(ref);
}

export function updateWebSession(
  sessionId: string,
  patch: Partial<Pick<WebSession, 'paper' | 'buySize' | 'ref'>>
): WebSession | null {
  const s = getSession(sessionId);
  if (!s) return null;
  Object.assign(s, patch);
  return s;
}
