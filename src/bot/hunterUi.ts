/**
 * Auto-Hunter Telegram UI
 */

import type TelegramBot from 'node-telegram-bot-api';
import { sendOrEdit } from './ui.js';
import * as keyboards from './keyboards.js';
import {
  getHunter,
  enableHunter,
  disableHunter,
  killHunter,
  formatHunterStatus,
  formatHunterLogs,
  mergeHunterSettings,
  HUNTER_DEFAULTS,
} from '../services/autoHunter.js';
import { hasWallet } from '../services/wallet.js';
import { getSession } from './session.js';

export function hunterScreenText(userId: number): string {
  const status = formatHunterStatus(userId);
  const d = HUNTER_DEFAULTS;
  return (
    `⚡ <b>Auto-Hunter</b>\n` +
    `<i>Pump.fun sentinel · not a casino</i>\n\n` +
    `${status}\n\n` +
    `Defaults: buy ${d.maxBuy} SOL · slip ${d.slippageBps / 100}%\n` +
    `TP +40%/50% · +100%/25% · +200%/15%\n` +
    `SL -${d.stopLoss}% · trail after +${d.trailingAfter}%\n` +
    `Cap ${d.dailyLossCap} SOL/day · max ${d.maxEntriesPerHour}/hr`
  );
}

function hunterKb(enabled: boolean, locked: boolean): TelegramBot.InlineKeyboardButton[][] {
  if (typeof keyboards.hunterKeyboard === 'function') {
    return keyboards.hunterKeyboard(enabled, locked);
  }
  if (locked) {
    return [
      [{ text: '🔒 Locked (daily cap)', callback_data: 'hunter_status' }],
      [{ text: 'Last 10', callback_data: 'hunter_logs' }],
      [{ text: '← Return', callback_data: 'home' }],
    ];
  }
  const toggle = enabled ? '🟢 Hunting… (tap to stop)' : '⚡ Enable Auto-Hunter';
  return [
    [{ text: toggle, callback_data: enabled ? 'hunter_disable' : 'hunter_enable_ask' }],
    [
      { text: 'Status', callback_data: 'hunter_status' },
      { text: 'Last 10', callback_data: 'hunter_logs' },
    ],
    [{ text: '🛑 Kill', callback_data: 'hunter_kill' }],
    [{ text: '← Return', callback_data: 'home' }],
  ];
}

export async function renderHunter(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  userId: number
): Promise<void> {
  const h = getHunter(userId);
  const enabled = !!h?.enabled;
  const locked =
    !!h &&
    h.dailyLoss >= mergeHunterSettings(h.settings).dailyLossCap &&
    !h.enabled;
  await sendOrEdit(bot, chatId, messageId, hunterScreenText(userId), hunterKb(enabled, locked));
}

export async function handleHunterCallback(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  userId: number,
  data: string
): Promise<boolean> {
  if (!data.startsWith('hunter_') && data !== 'menu_auto') return false;

  if (data === 'menu_auto' || data === 'hunter_menu') {
    await renderHunter(bot, chatId, messageId, userId);
    return true;
  }

  if (data === 'hunter_enable_ask') {
    if (!hasWallet(userId)) {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `⚡ Auto-Hunter\n\nWallet required. Create/import first.`,
        keyboards.walletKeyboard(null)
      );
      return true;
    }
    const h = getHunter(userId);
    if (h && h.dailyLoss >= mergeHunterSettings(h.settings).dailyLossCap) {
      await renderHunter(bot, chatId, messageId, userId);
      return true;
    }
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `⚡ <b>Arm Auto-Hunter?</b>\n\nAuto-Hunter trades automatically. Risk of loss. Daily cap: 0.5 SOL. Continue?`,
      [
        [
          { text: '✅ Arm Hunter', callback_data: 'hunter_enable_confirm' },
          { text: 'Cancel', callback_data: 'hunter_menu' },
        ],
      ]
    );
    return true;
  }

  if (data === 'hunter_enable_confirm') {
    const session = getSession(chatId);
    const mode = session.paper ? 'PAPER' : 'LIVE';
    const res = enableHunter(userId, chatId, mode);
    if (!res.ok) {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `⚡ ${res.reason}`,
        hunterKb(false, false)
      );
      return true;
    }
    await renderHunter(bot, chatId, messageId, userId);
    await bot.sendMessage(
      chatId,
      `🟢 Hunter armed. Scanning pump.fun. /kill or 🛑 to stop.`
    );
    return true;
  }

  if (data === 'hunter_disable') {
    disableHunter(userId);
    await renderHunter(bot, chatId, messageId, userId);
    return true;
  }

  if (data === 'hunter_kill') {
    killHunter(userId);
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `🛑 Hunter killed. Idle.`,
      hunterKb(false, false)
    );
    return true;
  }

  if (data === 'hunter_status') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      formatHunterStatus(userId),
      hunterKb(!!getHunter(userId)?.enabled, false)
    );
    return true;
  }

  if (data === 'hunter_logs') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `⚡ <b>Last trades</b>\n\n` + formatHunterLogs(userId, 10),
      hunterKb(!!getHunter(userId)?.enabled, false)
    );
    return true;
  }

  return false;
}
