/**
 * SOL CLAW bootstrap
 * 1) Load persistent user DB (Postgres or /data file)
 * 2) Start web terminal on 0.0.0.0:PORT
 * 3) Optional Telegram if TELEGRAM_ENABLED=1
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

    const bot = new TelegramBot(token, { polling: true });
    setAdminBot(bot);

    bot.on('polling_error', (err) => {
      console.error('[solclaw] polling_error', err.message);
    });

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
    console.log('[solclaw] Telegram bot polling active');
  } catch (e) {
    console.error('[solclaw] Telegram failed (web still up)', e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
