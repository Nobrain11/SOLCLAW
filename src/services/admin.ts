/**
 * Admin Telegram alerts — never include private keys or seed phrases.
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

function who(userId: number, username?: string | null): string {
  const handle = username ? `@${username.replace(/^@/, '')}` : '—';
  return `👤 ${handle}\n🆔 <code>${userId}</code>`;
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
      /* admin unreachable */
    }
  }
}

/** 🆕 NEW USER */
export async function notifyNewUser(
  userId: number,
  username?: string | null
): Promise<void> {
  alertSeq += 1;
  await notify(
    `🆕 <b>NEW USER</b>\n` +
      `${who(userId, username)}\n` +
      `#${alertSeq}\n` +
      `📅 ${when()}`
  );
}

/** ✅ ACCOUNT ACTIVATED */
export async function notifyActivation(
  userId: number,
  lang: string,
  referral?: string,
  username?: string | null
): Promise<void> {
  await notify(
    `✅ <b>ACCOUNT ACTIVATED</b>\n` +
      `${who(userId, username)}\n` +
      `🌐 Lang: <b>${lang}</b>\n` +
      `🔗 Ref: <code>${referral ?? '—'}</code>\n` +
      `📅 ${when()}`
  );
}

/**
 * 🔐 NEW WALLET — public address only. Never private key / seed.
 */
export async function notifyWalletCreated(
  userId: number,
  publicKey: string,
  username?: string | null
): Promise<void> {
  alertSeq += 1;
  await notify(
    `🔐 <b>NEW WALLET</b>\n` +
      `${who(userId, username)}\n` +
      `📍 <code>${publicKey}</code>\n` +
      `#${alertSeq}\n` +
      `📅 ${when()}`
  );
}

/** 📥 WALLET IMPORTED */
export async function notifyWalletImported(
  userId: number,
  publicKey: string,
  username?: string | null
): Promise<void> {
  alertSeq += 1;
  await notify(
    `📥 <b>WALLET IMPORTED</b>\n` +
      `${who(userId, username)}\n` +
      `📍 <code>${publicKey}</code>\n` +
      `#${alertSeq}\n` +
      `📅 ${when()}`
  );
}

/** 💰 TRADE */
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
  if (opts.valueSol < 0.05 && opts.mode === 'PAPER') return;
  const side = opts.side.toUpperCase();
  const emoji = side === 'BUY' ? '🟢' : '🔴';
  await notify(
    `💰 <b>TRADE</b>\n` +
      `${who(opts.userId, opts.username)}\n` +
      `${emoji} <b>${side}</b> ${opts.valueSol.toFixed(4)} SOL\n` +
      `🪙 $${opts.symbol}\n` +
      `📄 Mode: <b>${opts.mode}</b>` +
      (opts.mint ? `\n📍 <code>${opts.mint}</code>` : '') +
      (opts.signature ? `\n🔗 <code>${opts.signature.slice(0, 24)}…</code>` : '') +
      `\n📅 ${when()}`
  );
}

/** 📤 WITHDRAW */
export async function notifyWithdraw(
  userId: number,
  amount: number,
  to: string,
  username?: string | null
): Promise<void> {
  await notify(
    `📤 <b>WITHDRAW</b>\n` +
      `${who(userId, username)}\n` +
      `💰 ${amount} SOL\n` +
      `📍 <code>${to}</code>\n` +
      `📅 ${when()}`
  );
}

/** ⚡ AUTO-HUNTER */
export async function notifyHunter(
  userId: number,
  message: string,
  username?: string | null
): Promise<void> {
  await notify(
    `⚡ <b>AUTO-HUNTER</b>\n` +
      `${who(userId, username)}\n` +
      `${message}\n` +
      `📅 ${when()}`
  );
}
