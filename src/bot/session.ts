/**
 * User session + onboarding state.
 * Persisted via src/db/persist so redeploys keep users.
 * Never store private keys here.
 */

import type { Language } from '../i18n/index.js';
import {
  loadTelegramSession,
  saveTelegramSession,
  registerTelegramUser,
  updateUser,
  type TelegramSessionRecord,
} from '../db/persist.js';

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

const cache = new Map<number, UserSession>();

function fromRecord(r: TelegramSessionRecord): UserSession {
  return {
    chatId: r.chatId,
    userId: r.userId,
    language: (r.language as Language | null) ?? null,
    onboardingStep: (r.onboardingStep as OnboardingStep) || 'language',
    activated: r.activated,
    referralCode: r.referralCode,
    buySize: r.buySize,
    pendingToken: r.pendingToken,
    pendingSellPct: r.pendingSellPct,
    autoEnabled: r.autoEnabled,
    autoStrategy: (r.autoStrategy as UserSession['autoStrategy']) || 'balanced',
    paper: r.paper,
    alerts: r.alerts,
    lastScreen: r.lastScreen,
    updatedAt: r.updatedAt,
  };
}

function toRecord(s: UserSession): TelegramSessionRecord {
  return {
    chatId: s.chatId,
    userId: s.userId,
    language: s.language,
    onboardingStep: s.onboardingStep,
    activated: s.activated,
    referralCode: s.referralCode,
    buySize: s.buySize,
    pendingToken: s.pendingToken,
    pendingSellPct: s.pendingSellPct,
    autoEnabled: s.autoEnabled,
    autoStrategy: s.autoStrategy,
    paper: s.paper,
    alerts: s.alerts,
    lastScreen: s.lastScreen,
    updatedAt: s.updatedAt,
  };
}

export function getSession(chatId: number): UserSession {
  let s = cache.get(chatId);
  if (s) return s;

  const saved = loadTelegramSession(chatId);
  if (saved) {
    s = fromRecord(saved);
    cache.set(chatId, s);
    return s;
  }

  s = {
    chatId,
    ...DEFAULT_SESSION,
    updatedAt: Date.now(),
  };
  cache.set(chatId, s);
  saveTelegramSession(toRecord(s));
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
  cache.set(chatId, next);
  saveTelegramSession(toRecord(next));

  updateUser(`tg:${chatId}`, {
    language: next.language,
    activated: next.activated,
    paper: next.paper,
    buySize: next.buySize,
    autoEnabled: next.autoEnabled,
    autoStrategy: next.autoStrategy,
    alerts: next.alerts,
    referralCode: next.referralCode,
  });

  return next;
}

export function clearPendingToken(chatId: number): void {
  updateSession(chatId, { pendingToken: undefined, pendingSellPct: undefined });
}

export function isOnboarded(session: UserSession): boolean {
  return session.activated === true && session.language != null;
}

export function registerOnStart(msg: {
  chat: { id: number };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
}): UserSession {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id ?? chatId;

  registerTelegramUser({
    telegramId,
    username: msg.from?.username,
    firstName: msg.from?.first_name,
    lastName: msg.from?.last_name,
  });

  const session = getSession(chatId);
  if (!session.activated && !session.language) {
    updateSession(chatId, {
      userId: telegramId,
      onboardingStep: 'language',
    });
  } else {
    updateSession(chatId, {
      userId: telegramId,
      activated: true,
    });
  }
  return getSession(chatId);
}
