/**
 * SOL CLAW bootstrap
 * - Always starts the live WEB terminal on process.env.PORT (Railway)
 * - Starts Telegram bot only when BOT_TOKEN is set
 */

import { validateEnvForTrading } from './config/env.js';

validateEnvForTrading();

async function main(): Promise<void> {
  try {
    await import('./web/server.js');
  } catch (e) {
    console.error('[solclaw] web terminal failed to start', e);
    process.exit(1);
  }

  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.warn(
      '[solclaw] BOT_TOKEN not set — web terminal only (Telegram disabled)'
    );
    return;
  }

  try {
    const TelegramBot = (await import('node-telegram-bot-api')).default;
    const { handleStart, handleCallback, handleText } = await import(
      './bot/callbacks.js'
    );
    const { startTpslMonitor } = await import('./services/tpsl.js');
    const { setAdminBot } = await import('./services/admin.js');

    const bot = new TelegramBot(token, { polling: true });
    setAdminBot(bot);

    bot.onText(/\/start/, (msg) => {
      handleStart(bot, msg).catch((err) => console.error('start', err));
    });

    bot.on('callback_query', (q) => {
      handleCallback(bot, q).catch((err) => console.error('callback', err));
    });

    bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        handleText(bot, msg).catch((err) => console.error('text', err));
      }
    });

    startTpslMonitor(bot);
    console.log('SOL CLAW Telegram bot running (TP/SL monitor active)');
  } catch (e) {
    console.error('[solclaw] Telegram bot failed (web still up)', e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
