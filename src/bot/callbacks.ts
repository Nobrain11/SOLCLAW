/**
 * SOL CLAW callback router
 */

import type TelegramBot from 'node-telegram-bot-api';
import { answerCallback, sendOrEdit } from './ui.js';
import * as screens from './screens.js';
import { getSession, updateSession, isOnboarded, registerOnStart } from './session.js';
import { handleHunterCallback } from './hunterUi.js';
import type { Language } from '../i18n/index.js';
import { t, isLanguage } from '../i18n/index.js';
import * as keyboards from './keyboards.js';
import * as wallet from '../services/wallet.js';
import { scanToken, formatTokenAnalysisMessage } from '../services/scanner.js';
import { executeTrade } from '../services/trading.js';
import {
  getOpenPositions,
  refreshPositions,
  countOpen,
} from '../services/positions.js';
import { getPnlStats, getHistory } from '../services/history.js';
import { isValidPublicKey } from '../services/rpc.js';
import { setAutoEnabled } from '../services/auto.js';
import {
  applyReferral,
  parseStartPayload,
} from '../services/referral.js';
import { env } from '../config/env.js';
import {
  buildLeaderboard,
  formatLeaderboardMessage,
} from '../services/leaderboard.js';
import * as admin from '../services/admin.js';
import { getTrendingTokens, formatTrendingMessage } from '../services/trending.js';
import { getSolPrice, formatSolHeader } from '../services/solPrice.js';
import { getUserRewards, claimAll, formatRewardsMessage } from '../services/rewards.js';

function langOf(chatId: number): Language | null {
  return getSession(chatId).language;
}

async function renderHome(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  uid: number
): Promise<void> {
  const session = getSession(chatId);
  const lang = session.language ?? 'en';
  const open = countOpen(uid);
  const stats = getPnlStats(uid);
  const hasWallet = wallet.hasWallet(uid);
  let portfolioSol = 0;
  try {
    if (hasWallet) {
      const info = await wallet.getWalletInfo(uid);
      portfolioSol = info?.balanceSol ?? 0;
    }
  } catch { /* */ }
  let solPriceLine = '◎ SOL —';
  try {
    const snap = await getSolPrice();
    solPriceLine = formatSolHeader(snap);
  } catch { /* */ }
  const screen = screens.homeScreen(lang, {
    openPositions: open,
    realizedPnl: stats.realizedPnl,
    autoTrade: session.autoEnabled,
    alerts: session.alerts,
    paper: session.paper,
    buySize: session.buySize,
    takeProfit: 50,
    stopLoss: -20,
    walletConnected: hasWallet,
    portfolioSol,
    solPriceLine,
  });
  await sendOrEdit(bot, chatId, messageId, screen.text, screen.keyboard);
}

export async function handleStart(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  if (!msg.chat?.id) return;
  const chatId = msg.chat.id;
  const uid = msg.from?.id ?? 0;

  registerOnStart(msg);
  if (uid) updateSession(chatId, { userId: uid });

  const parts = (msg.text ?? '').trim().split(/\s+/);
  const payload = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  const refCode = parseStartPayload(payload);
  const session = getSession(chatId);

  if (isOnboarded(session) || (session.language && session.activated)) {
    if (refCode && uid) applyReferral(uid, refCode);
    await renderHome(bot, chatId, undefined, uid);
    return;
  }

  if (refCode && uid) {
    const res = applyReferral(uid, refCode);
    if (res.ok) updateSession(chatId, { referralCode: refCode });
  }

  if (!session.language) {
    updateSession(chatId, { onboardingStep: 'language' });
    void admin.notifyNewUser(uid, msg.from?.username);
    const s = screens.languageScreen();
    await bot.sendMessage(chatId, s.text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: s.keyboard },
    });
    return;
  }

  updateSession(chatId, { activated: true, onboardingStep: 'done' });
  void admin.notifyActivation(uid, session.language, session.referralCode);
  await renderHome(bot, chatId, undefined, uid);
}

export async function handleCallback(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  const data = query.data;
  if (!data || !query.message) {
    await answerCallback(bot, query);
    return;
  }
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const uid = query.from?.id ?? 0;
  if (uid) updateSession(chatId, { userId: uid });
  await answerCallback(bot, query);

  // Auto-Hunter routes first
  if (await handleHunterCallback(bot, chatId, messageId, uid, data)) {
    return;
  }

  let session = getSession(chatId);

  if (data.startsWith('language_')) {
    const code = data.replace('language_', '');
    if (!isLanguage(code)) return;
    updateSession(chatId, {
      language: code,
      activated: true,
      onboardingStep: 'done',
    });
    void admin.notifyActivation(uid, code, session.referralCode);
    await renderHome(bot, chatId, messageId, uid);
    return;
  }

  if (data === 'onboard_continue' || data === 'onboard_enter_home') {
    updateSession(chatId, { activated: true, onboardingStep: 'done' });
    await renderHome(bot, chatId, messageId, uid);
    return;
  }

  if (!isOnboarded(getSession(chatId))) {
    if (!session.language) {
      const s = screens.languageScreen();
      await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
      return;
    }
    updateSession(chatId, { activated: true, onboardingStep: 'done' });
  }

  session = getSession(chatId);
  const lang = session.language ?? 'en';

  if (data === 'home') {
    await renderHome(bot, chatId, messageId, uid);
    return;
  }
  if (data === 'menu_manual') {
    const s = screens.manualEntryScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_wallet' || data === 'wallet_refresh' || data === 'wallet_balance') {
    const info = await wallet.getWalletInfo(uid).catch(() => null);
    const screen = screens.walletScreen(lang, {
      address: info?.publicKey ?? '—',
      balance: info?.balanceSol ?? 0,
      connected: !!info,
    });
    await sendOrEdit(bot, chatId, messageId, screen.text, screen.keyboard);
    return;
  }
  if (data === 'positions_open' || data === 'positions_refresh') {
    const open = await refreshPositions(uid);
    if (open.length === 0) {
      const s = screens.positionsEmptyScreen(lang);
      await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
      return;
    }
    const lines = open.map((p) => {
      const sign = p.unrealizedPnl >= 0 ? '+' : '';
      return `• <b>${p.symbol}</b> [${p.mode}]\n  PnL: ${sign}${p.unrealizedPnl.toFixed(4)} SOL`;
    });
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `📈 <b>POSITIONS</b> (${open.length})\n\n` + lines.join('\n\n'),
      keyboards.positionsKeyboard(lang)
    );
    return;
  }
  if (data === 'menu_alerts') {
    const s = screens.alertsScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_settings') {
    const s = screens.settingsScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'settings_language') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `🌍 <b>Language</b>`,
      keyboards.settingsLanguageKeyboard()
    );
    return;
  }
  if (data === 'menu_pnl' || data === 'pnl_refresh') {
    const live = getPnlStats(uid, 'LIVE');
    const paper = getPnlStats(uid, 'PAPER');
    const text =
      `🏆 <b>PNL</b>\n\nLIVE ${live.realizedPnl.toFixed(4)} SOL\nPAPER ${paper.realizedPnl.toFixed(4)} SOL`;
    await sendOrEdit(bot, chatId, messageId, text, keyboards.pnlKeyboard(lang));
    return;
  }
  if (data === 'menu_history' || data === 'history_refresh') {
    const hist = getHistory(uid, undefined, 10);
    const lines =
      hist.length === 0
        ? ['No trades yet.']
        : hist.map(
            (h) =>
              `• ${h.side} <b>${h.symbol}</b> [${h.mode}] ${h.valueSol.toFixed(4)}`
          );
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `📜 <b>HISTORY</b>\n\n` + lines.join('\n'),
      keyboards.historyKeyboard(lang)
    );
    return;
  }
  if (data === 'menu_leaderboard' || data === 'lb_all') {
    const entries = buildLeaderboard('all', 10);
    const text = formatLeaderboardMessage('all', entries, uid);
    await sendOrEdit(bot, chatId, messageId, text, keyboards.leaderboardKeyboard(lang));
    return;
  }
  if (data === 'lb_daily' || data === 'lb_weekly') {
    const period = data === 'lb_daily' ? 'daily' : 'weekly';
    const entries = buildLeaderboard(period, 10);
    const text = formatLeaderboardMessage(period, entries, uid);
    await sendOrEdit(bot, chatId, messageId, text, keyboards.leaderboardKeyboard(lang));
    return;
  }
  if (data === 'menu_trending' || data === 'trending_refresh') {
    try {
      const items = await getTrendingTokens(10, data === 'trending_refresh');
      const text = formatTrendingMessage(items);
      await sendOrEdit(bot, chatId, messageId, text, keyboards.trendingKeyboard(lang));
    } catch {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        'Could not load pump.fun feed.',
        keyboards.trendingKeyboard(lang)
      );
    }
    return;
  }
  if (data === 'menu_rewards' || data === 'rewards_link' || data === 'rewards_settings') {
    const r = getUserRewards(uid);
    const text = formatRewardsMessage(r, env.BOT_USERNAME || undefined);
    await sendOrEdit(bot, chatId, messageId, text, keyboards.rewardsKeyboard(lang));
    return;
  }
  if (data === 'rewards_claim') {
    const res = claimAll(uid);
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `Claimed <b>${res.claimedSol.toFixed(4)} SOL</b>`,
      keyboards.rewardsKeyboard(lang)
    );
    return;
  }
  if (data === 'menu_security') {
    const s = screens.securityScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_help') {
    const s = screens.helpScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'wallet_create') {
    try {
      if (wallet.hasWallet(uid)) {
        await sendOrEdit(bot, chatId, messageId, t(lang, 'wallet.exists'), keyboards.walletKeyboard(lang));
        return;
      }
      const { publicKey } = await wallet.createWallet(uid);
      void admin.notifyWalletCreated(uid, publicKey);
      await sendOrEdit(bot, chatId, messageId, `Wallet created\n<code>${publicKey}</code>`, keyboards.walletKeyboard(lang));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      await sendOrEdit(bot, chatId, messageId, msg, keyboards.walletKeyboard(lang));
    }
    return;
  }
  if (data === 'wallet_import') {
    updateSession(chatId, { lastScreen: 'await_import_key' });
    await sendOrEdit(bot, chatId, messageId, t(lang, 'wallet.import_prompt'), keyboards.walletKeyboard(lang));
    return;
  }
  if (data === 'set_paper_toggle') {
    updateSession(chatId, { paper: !session.paper });
    await renderHome(bot, chatId, messageId, uid);
    return;
  }
  if (data === 'auto_toggle') {
    const next = !session.autoEnabled;
    updateSession(chatId, { autoEnabled: next });
    setAutoEnabled(uid, chatId, next, session.autoStrategy, session.paper ? 'PAPER' : 'LIVE');
    const s = screens.autoTradeScreen(lang, next);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  await renderHome(bot, chatId, messageId, uid);
}

export async function handleText(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  if (!msg.chat?.id || !msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const uid = msg.from?.id ?? 0;
  const text = msg.text.trim();
  const session = getSession(chatId);
  const lang = session.language;

  if (session.lastScreen === 'await_import_key') {
    updateSession(chatId, { lastScreen: undefined });
    try {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch { /* */ }
      const { publicKey } = await wallet.importWallet(uid, text);
      void admin.notifyWalletImported(uid, publicKey);
      await bot.sendMessage(chatId, `Imported\n<code>${publicKey}</code>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboards.walletKeyboard(lang) },
      });
    } catch {
      await bot.sendMessage(chatId, t(lang, 'wallet.invalid_key'), {
        reply_markup: { inline_keyboard: keyboards.walletKeyboard(lang) },
      });
    }
    return;
  }

  if (!isOnboarded(session)) {
    await bot.sendMessage(chatId, t(lang, 'gate.incomplete'));
    return;
  }

  if (isValidPublicKey(text) && text.length >= 32) {
    updateSession(chatId, { pendingToken: text });
    await bot.sendMessage(chatId, 'Scanning…');
    try {
      const analysis = await scanToken(text);
      const body = formatTokenAnalysisMessage(analysis);
      await bot.sendMessage(chatId, body, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboards.tokenTradeKeyboard(lang) },
        disable_web_page_preview: true,
      });
    } catch {
      await bot.sendMessage(chatId, t(lang, 'manual.scan_fail'));
    }
  }
}
