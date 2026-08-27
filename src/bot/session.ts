/**
 * Lightweight in-memory session store.
 * Replace with your real repository / Redis later.
 * Never store private keys here.
 */

export type UserSession = {
  chatId: number;
  userId?: number;
  /** Selected buy size for manual trade (SOL) */
  buySize: number;
  /** Pending token CA while in manual flow */
  pendingToken?: string;
  /** Pending sell percentage 0–100 */
  pendingSellPct?: number;
  /** Auto-trade enabled */
  autoEnabled: boolean;
  /** Selected auto strategy */
  autoStrategy: 'careful' | 'balanced' | 'bold' | 'custom';
  /** Paper trading flag (UI only until DB field exists) */
  paper: boolean;
  /** Alerts flag (UI only until DB field exists) */
  alerts: boolean;
  /** Last screen for optional back-stack */
  lastScreen?: string;
  updatedAt: number;
};

const DEFAULT_SESSION: Omit<UserSession, 'chatId' | 'updatedAt'> = {
  buySize: 0.05,
  autoEnabled: false,
  autoStrategy: 'balanced',
  paper: false,
  alerts: false,
};

const store = new Map<number, UserSession>();

export function getSession(chatId: number): UserSession {
  let s = store.get(chatId);
  if (!s) {
    s = {
      chatId,
      ...DEFAULT_SESSION,
      updatedAt: Date.now(),
    };
    store.set(chatId, s);
  }
  return s;
}

export function updateSession(
  chatId: number,
  patch: Partial<Omit<UserSession, 'chatId'>>
): UserSession {
  const current = getSession(chatId);
  const next: UserSession = {
    ...current,
    ...patch,
    chatId,
    updatedAt: Date.now(),
  };
  store.set(chatId, next);
  return next;
}

export function clearPendingToken(chatId: number): void {
  updateSession(chatId, { pendingToken: undefined, pendingSellPct: undefined });
}
