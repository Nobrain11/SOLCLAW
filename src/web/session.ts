/**
 * Web session — cookie sessionId → userId
 * Persisted so redeploy keeps visitors + settings.
 */

import { randomBytes } from 'node:crypto';
import {
  loadWebSession,
  saveWebSession,
  registerWebUser,
  type WebSessionRecord,
} from '../db/persist.js';

export type WebSession = {
  sessionId: string;
  userId: number;
  ref?: string;
  paper: boolean;
  buySize: number;
  createdAt: number;
  lastSeen: number;
};

const cache = new Map<string, WebSession>();

function userIdFromSession(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (Math.imul(31, h) + sessionId.charCodeAt(i)) | 0;
  }
  return 2_000_000_000 + (Math.abs(h) % 900_000_000);
}

function fromRecord(r: WebSessionRecord): WebSession {
  return { ...r };
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
  cache.set(sessionId, s);
  saveWebSession(s);
  registerWebUser(sessionId, ref);
  return s;
}

export function getSession(sessionId: string | undefined): WebSession | null {
  if (!sessionId) return null;
  let s = cache.get(sessionId);
  if (!s) {
    const saved = loadWebSession(sessionId);
    if (!saved) return null;
    s = fromRecord(saved);
    cache.set(sessionId, s);
  }
  s.lastSeen = Date.now();
  saveWebSession(s);
  return s;
}

export function getOrCreateSession(
  sessionId: string | undefined,
  ref?: string
): WebSession {
  const existing = getSession(sessionId);
  if (existing) {
    if (ref && !existing.ref) {
      existing.ref = ref.slice(0, 64);
      saveWebSession(existing);
    }
    registerWebUser(existing.sessionId, existing.ref);
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
  saveWebSession(s);
  return s;
}
