/**
 * SOL CLAW bootstrap
 */

import { validateEnvForTrading } from './config/env.js';
import { initDb, userCount, getBackend } from './db/persist.js';

validateEnvForTrading();

async function main(): Promise<void> {
  await initDb();
  console.log(`[solclaw] users registered: ${userCount()} (backend=${getBackend()})`);

  try {
    await import('./web/server.js');
  } catch (e) {
    console.error('[solclaw] web terminal failed to start', e);
    process.exit(1);
  }

  const token = process.env.BOT_TOKEN;
  const tgOn =
    process.env.TELEGRAM_ENABLED === '1' ||
    process.env.TELEGRAM_ENABLED === 'true';

  if (!token || !tgOn) {
    console.warn(
      '[solclaw] Telegram polling off (set TELEGRAM_ENABLED=1 and BOT_TOKEN to enable)'
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
    const { startHunterLoop, killHunter } = await import(
      './services/autoHunter.js'
    );

    const bot = new TelegramBot(token, { polling: true });
    setAdminBot(bot);

    bot.on('polling_error', (err) => {
      console.error('[solclaw] polling_error', err.message);
    });

    bot.onText(/\/start/, (msg) => {
      handleStart(bot, msg).catch((err) => console.error('start', err));
    });

    bot.onText(/\/kill/, (msg) => {
      const uid = msg.from?.id;
      if (!uid || !msg.chat?.id) return;
      killHunter(uid);
      bot.sendMessage(msg.chat.id, '🛑 Hunter killed.').catch(() => {});
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
    startHunterLoop((chatId, text) => {
      bot.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => {});
    });
    console.log('[solclaw] Telegram bot + Auto-Hunter loop active');
  } catch (e) {
    console.error('[solclaw] Telegram failed (web still up)', e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
