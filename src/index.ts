/**
 * SOL TRADE BOT bootstrap
 */

import TelegramBot from 'node-telegram-bot-api';
import { handleStart, handleCallback, handleText } from './bot/callbacks.js';
import { validateEnvForTrading } from './config/env.js';
import { startTpslMonitor } from './services/tpsl.js';

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('Missing BOT_TOKEN');
  process.exit(1);
}

validateEnvForTrading();

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  handleStart(bot, msg).catch((e) => console.error('start', e));
});

bot.on('callback_query', (q) => {
  handleCallback(bot, q).catch((e) => console.error('callback', e));
});

bot.on('message', (msg) => {
  if (msg.text && !msg.text.startsWith('/')) {
    handleText(bot, msg).catch((e) => console.error('text', e));
  }
});

// TP/SL monitor — alerts via Telegram
startTpslMonitor(async (chatId, text) => {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch {
    /* user may have blocked bot */
  }
}, 20_000);

console.log('🐱 SOL TRADE BOT running (TP/SL monitor active)');
