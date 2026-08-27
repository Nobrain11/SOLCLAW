/**
 * Admin notifications — new users, wallets, trades, activations.
 * Set ADMIN_CHAT_IDS=123,456 in env (comma-separated Telegram chat IDs).
 */

import type TelegramBot from 'node-telegram-bot-api';
import { env } from '../config/env.js';

let botRef: TelegramBot | null = null;

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
      /* admin unreachable — ignore */
    }
  }
}

export async function notifyNewUser(userId: number, username?: string): Promise<void> {
  const who = username ? `@${username}` : `id:${userId}`;
  await notify(`👤 <b>New user</b>\n${who}\n<code>${userId}</code>`);
}

export async function notifyActivation(
  userId: number,
  lang: string,
  referral?: string
): Promise<void> {
  await notify(
    `✅ <b>Account activated</b>\n` +
      `User: <code>${userId}</code>\n` +
      `Lang: ${lang}\n` +
      `Ref: ${referral ?? '—'}`
  );
}

export async function notifyWalletCreated(
  userId: number,
  publicKey: string
): Promise<void> {
  await notify(
    `➕ <b>Wallet created</b>\n` +
      `User: <code>${userId}</code>\n` +
      `<code>${publicKey}</code>`
  );
}

export async function notifyWalletImported(
  userId: number,
  publicKey: string
): Promise<void> {
  await notify(
    `📥 <b>Wallet imported</b>\n` +
      `User: <code>${userId}</code>\n` +
      `<code>${publicKey}</code>`
  );
}

export async function notifyTrade(opts: {
  userId: number;
  side: string;
  symbol: string;
  valueSol: number;
  mode: string;
  signature?: string;
}): Promise<void> {
  if (opts.valueSol < 0.05 && opts.mode === 'PAPER') return;
  await notify(
    `💹 <b>${opts.side}</b> [${opts.mode}]\n` +
      `User: <code>${opts.userId}</code>\n` +
      `${opts.symbol} · ${opts.valueSol.toFixed(4)} SOL` +
      (opts.signature ? `\n<code>${opts.signature.slice(0, 20)}…</code>` : '')
  );
}

export async function notifyWithdraw(
  userId: number,
  amount: number,
  to: string
): Promise<void> {
  await notify(
    `📤 <b>Withdraw</b>\n` +
      `User: <code>${userId}</code>\n` +
      `${amount} SOL → <code>${to.slice(0, 8)}…</code>`
  );
}
