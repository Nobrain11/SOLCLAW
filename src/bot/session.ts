/**
 * User session — referral is OPTIONAL and never blocks trading.
 */

import type { Language } from '../i18n/index.js';

export type OnboardingStep =
  | 'language'
  | 'welcome'
  | 'referral'
  | 'activation'
  | 'done';

export type UserSession = {
  chatId: number;
  userId?: number;
  language: Language | null;
  onboardingStep: OnboardingStep;
  activated: boolean;
  referralCode?: string;
  buySize: number;
  pendingToken?: string;
  pendingSellPct?: number;
  autoEnabled: boolean;
  autoStrategy: 'careful' | 'balanced' | 'bold' | 'custom';
  paper: boolean;
  alerts: boolean;
  lastScreen?: string;
  updatedAt: number;
};

const DEFAULT_SESSION: Omit<UserSession, 'chatId' | 'updatedAt'> = {
  language: null,
  onboardingStep: 'language',
  activated: false,
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
    s = { chatId, ...DEFAULT_SESSION, updatedAt: Date.now() };
    store.set(chatId, s);
  }
  return s;
}

export function updateSession(
  chatId: number,
  patch: Partial<Omit<UserSession, 'chatId'>>
): UserSession {
  const current = getSession(chatId);
  const next: UserSession = { ...current, ...patch, chatId, updatedAt: Date.now() };
  store.set(chatId, next);
  return next;
}

export function clearPendingToken(chatId: number): void {
  updateSession(chatId, { pendingToken: undefined, pendingSellPct: undefined });
}

export function isOnboarded(session: UserSession): boolean {
  // Referral is optional — never blocks trading
  return session.activated === true && session.language != null;
}
