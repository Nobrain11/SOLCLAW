/**
 * Shared UI helpers for node-telegram-bot-api.
 * Prefer editMessageText. Always answerCallbackQuery.
 * Gracefully ignore "message is not modified".
 */

import type TelegramBot from 'node-telegram-bot-api';

export async function answerCallback(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery,
  text?: string
): Promise<void> {
  try {
    await bot.answerCallbackQuery(query.id, text ? { text } : undefined);
  } catch {
    // ignore — query may already be answered
  }
}

export async function safeEditMessage(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  text: string,
  keyboard: TelegramBot.InlineKeyboardButton[][],
  parseMode: TelegramBot.ParseMode = 'HTML'
): Promise<void> {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: parseMode,
      reply_markup: { inline_keyboard: keyboard },
      disable_web_page_preview: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('message is not modified')) {
      return;
    }
    // Fallback: send a new message if edit is impossible
    try {
      await bot.sendMessage(chatId, text, {
        parse_mode: parseMode,
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true,
      });
    } catch {
      // last resort — swallow
    }
  }
}

export async function sendOrEdit(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  text: string,
  keyboard: TelegramBot.InlineKeyboardButton[][]
): Promise<void> {
  if (messageId != null) {
    await safeEditMessage(bot, chatId, messageId, text, keyboard);
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
      disable_web_page_preview: true,
    });
  }
}
