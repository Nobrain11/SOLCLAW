/**
 * SOL CLAW bootstrap
 * 1) Load persistent user DB (Postgres or /data file)
 * 2) Start web terminal on 0.0.0.0:PORT
 * 3) Always start TP/SL + Auto-Hunter loops
 * 4) Optional Telegram if TELEGRAM_ENABLED=1
 */

import { validateEnvForTrading } from './config/env.js';
import { initDb, userCount, getBackend } from './db/persist.js';

validateEnvForTrading();

async function main(): Promise<void> {
  await initDb();
  console.log(
    `[solclaw] users registered: ${userCount()} (backend=${getBackend()})`
  );

  try {
    await import('./web/server.js');
  } catch (e) {
    console.error('[solclaw] web terminal failed to start', e);
    process.exit(1);
  }

  const { startTpslMonitor } = await import('./services/tpsl.js');
  const { startHunterLoop, killHunter } = await import(
    './services/autoHunter.js'
  );

  let alertFn:
    | ((userId: number, text: string) => Promise<void>)
    | undefined;

  const token = process.env.BOT_TOKEN;
  const tgOn =
    process.env.TELEGRAM_ENABLED === '1' ||
    process.env.TELEGRAM_ENABLED === 'true';

  if (token && tgOn) {
    try {
      const TelegramBot = (await import('node-telegram-bot-api')).default;
      const { handleStart, handleCallback, handleText } = await import(
        './bot/callbacks.js'
      );
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

      bot.onText(/\/kill/, (msg) => {
        const uid = msg.from?.id;
        if (!uid || !msg.chat?.id) return;
        killHunter(uid);
        bot.sendMessage(msg.chat.id, '🛑 Hunter killed.').catch(() => {});
      });

      alertFn = async (userId, text) => {
        await bot.sendMessage(userId, text, { parse_mode: 'HTML' });
      };

      console.log('[solclaw] Telegram bot polling active');
    } catch (e) {
      console.error('[solclaw] Telegram failed (web still up)', e);
    }
  } else {
    console.warn(
      '[solclaw] Telegram polling off (set TELEGRAM_ENABLED=1 and BOT_TOKEN to enable)'
    );
  }

  startTpslMonitor(alertFn);
  startHunterLoop((chatId, text) => {
    if (alertFn) {
      void alertFn(chatId, text);
    } else {
      console.log(`[hunter→${chatId}] ${text.replace(/\n/g, ' | ')}`);
    }
  });
  console.log('[solclaw] TP/SL monitor + Auto-Hunter loop active');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
