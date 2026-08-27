/**
 * SOL CLAW callback router — onboarding, live SOL price, rewards, trading.
 */

import type TelegramBot from 'node-telegram-bot-api';
import { answerCallback, sendOrEdit } from './ui.js';
import * as screens from './screens.js';
import { getSession, updateSession, isOnboarded } from './session.js';
import type { Language } from '../i18n/index.js';
import { t, isLanguage } from '../i18n/index.js';
import * as keyboards from './keyboards.js';
import * as wallet from '../services/wallet.js';
import { scanToken, formatTokenAnalysisMessage } from '../services/scanner.js';
import { formatUsd } from '../services/market.js';
import { executeTrade } from '../services/trading.js';
import {
  getOpenPositions,
  refreshPositions,
  countOpen,
} from '../services/positions.js';
import { getPnlStats, getHistory } from '../services/history.js';
import { isValidPublicKey } from '../services/rpc.js';
import { formatStrategyMessage } from '../services/strategies.js';
import { setAutoEnabled, setAutoStrategy } from '../services/auto.js';
import {
  applyReferral,
  parseStartPayload,
  hasReferral,
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
  } catch {
    /* RPC soft-fail */
  }
  let solPriceLine = '◎ SOL —';
  try {
    const snap = await getSolPrice();
    solPriceLine = formatSolHeader(snap);
  } catch {
    /* soft-fail */
  }
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

async function renderWallet(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  uid: number
): Promise<void> {
  const lang = langOf(chatId) ?? 'en';
  try {
    const info = await wallet.getWalletInfo(uid);
    if (!info) {
      const screen = screens.walletScreen(lang, {
        address: '—',
        balance: 0,
        connected: false,
      });
      await sendOrEdit(bot, chatId, messageId, screen.text, screen.keyboard);
      return;
    }
    const screen = screens.walletScreen(lang, {
      address: info.publicKey,
      balance: info.balanceSol,
      connected: true,
    });
    await sendOrEdit(bot, chatId, messageId, screen.text, screen.keyboard);
  } catch {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      t(lang, 'wallet.rpc_error'),
      keyboards.walletKeyboard(lang)
    );
  }
}

function requireOnboarded(session: ReturnType<typeof getSession>): boolean {
  return isOnboarded(session);
}

async function gateOrHome(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  uid: number
): Promise<boolean> {
  const session = getSession(chatId);
  if (requireOnboarded(session)) return true;
  if (!session.language) {
    const s = screens.languageScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return false;
  }
  if (session.onboardingStep === 'welcome') {
    const s = screens.welcomeScreen(session.language);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return false;
  }
  if (
    session.onboardingStep === 'referral' ||
    (!session.referralCode && !hasReferral(uid))
  ) {
    const s = screens.referralScreen(session.language);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return false;
  }
  if (session.onboardingStep === 'activation') {
    const s = screens.activationScreen(session.language);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return false;
  }
  const s = screens.languageScreen();
  await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
  return false;
}

export async function handleStart(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  if (!msg.chat?.id) return;
  const chatId = msg.chat.id;
  const uid = msg.from?.id ?? 0;
  if (uid) updateSession(chatId, { userId: uid });

  const parts = (msg.text ?? '').trim().split(/\s+/);
  const payload = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  const refCode = parseStartPayload(payload);
  const session = getSession(chatId);

  if (isOnboarded(session)) {
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

  if (session.onboardingStep === 'welcome') {
    const s = screens.welcomeScreen(session.language);
    await bot.sendMessage(chatId, s.text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: s.keyboard },
    });
    return;
  }

  const hasRef = !!session.referralCode || (uid ? hasReferral(uid) : false);
  if (!hasRef || session.onboardingStep === 'referral') {
    updateSession(chatId, { onboardingStep: 'referral' });
    const s = screens.referralScreen(session.language);
    await bot.sendMessage(chatId, s.text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: s.keyboard },
    });
    return;
  }

  if (session.onboardingStep === 'activation' || !session.activated) {
    updateSession(chatId, { onboardingStep: 'activation' });
    const s = screens.activationScreen(session.language);
    await bot.sendMessage(chatId, s.text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: s.keyboard },
    });
    return;
  }

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

  let session = getSession(chatId);

  if (data.startsWith('language_')) {
    const code = data.replace('language_', '');
    if (!isLanguage(code)) return;
    updateSession(chatId, {
      language: code,
      onboardingStep: session.activated ? 'done' : 'welcome',
    });
    session = getSession(chatId);
    if (session.activated) {
      await renderHome(bot, chatId, messageId, uid);
      return;
    }
    const s = screens.welcomeScreen(code);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  if (data === 'onboard_continue') {
    session = getSession(chatId);
    const hasRef =
      !!session.referralCode || (uid ? hasReferral(uid) : false);
    if (hasRef) {
      updateSession(chatId, { onboardingStep: 'activation' });
      const s = screens.activationScreen(session.language ?? 'en');
      await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
      return;
    }
    updateSession(chatId, { onboardingStep: 'referral' });
    const s = screens.referralScreen(session.language);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  if (data === 'referral_enter') {
    const lang = langOf(chatId);
    updateSession(chatId, { lastScreen: 'await_referral' });
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      t(lang, 'referral.prompt'),
      keyboards.referralKeyboard(lang)
    );
    return;
  }

  if (data === 'referral_how') {
    const lang = langOf(chatId);
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      t(lang, 'referral.body') + '\n\n' + t(lang, 'referral.prompt'),
      keyboards.referralKeyboard(lang)
    );
    return;
  }

  if (data === 'onboard_enter_home') {
    updateSession(chatId, {
      activated: true,
      onboardingStep: 'done',
      autoEnabled: false,
      alerts: false,
      paper: false,
      buySize: 0.05,
    });
    void admin.notifyActivation(
      uid,
      session.language ?? 'en',
      session.referralCode
    );
    await renderHome(bot, chatId, messageId, uid);
    return;
  }

  if (!requireOnboarded(getSession(chatId))) {
    if (data === 'menu_docs' || data === 'menu_website') {
      const lang = langOf(chatId);
      const url =
        data === 'menu_docs'
          ? env.DOCUMENTATION_URL || env.DOCS_URL
          : env.WEBSITE_URL;
      const msg = url
        ? url
        : t(lang, data === 'menu_docs' ? 'docs.missing' : 'website.missing');
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        msg,
        keyboards.welcomeKeyboard(lang)
      );
      return;
    }
    await gateOrHome(bot, chatId, messageId, uid);
    return;
  }

  const lang = langOf(chatId) ?? 'en';

  if (data === 'home') {
    await renderHome(bot, chatId, messageId, uid);
    return;
  }
  if (data === 'menu_manual') {
    const s = screens.manualEntryScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_auto') {
    const s = screens.autoTradeScreen(lang, session.autoEnabled);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_wallet') {
    await renderWallet(bot, chatId, messageId, uid);
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
      return (
        `• <b>${p.symbol}</b> [${p.mode}]\n` +
        `  $${formatUsd(p.entryPrice, 8)} → $${formatUsd(p.currentPrice, 8)}\n` +
        `  PnL: ${sign}${p.unrealizedPnl.toFixed(4)} SOL`
      );
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
      `🏆 <b>PNL</b>\n\n` +
      `<b>LIVE</b>\n` +
      `${live.realizedPnl >= 0 ? '+' : ''}${live.realizedPnl.toFixed(4)} SOL · ${live.trades} trades\n\n` +
      `<b>PAPER</b>\n` +
      `${paper.realizedPnl >= 0 ? '+' : ''}${paper.realizedPnl.toFixed(4)} SOL · ${paper.trades} trades`;
    await sendOrEdit(bot, chatId, messageId, text, keyboards.pnlKeyboard(lang));
    return;
  }
  if (data === 'menu_history' || data === 'history_refresh') {
    const hist = getHistory(uid, undefined, 10);
    if (hist.length === 0) {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `📜 <b>HISTORY</b>\n\nNo trades yet.`,
        keyboards.historyKeyboard(lang)
      );
      return;
    }
    const lines = hist.map((h) => {
      const pnl =
        h.pnlSol != null
          ? ` · ${h.pnlSol >= 0 ? '+' : ''}${h.pnlSol.toFixed(4)}`
          : '';
      return `• ${h.side} <b>${h.symbol}</b> [${h.mode}] ${h.valueSol.toFixed(4)}${pnl}`;
    });
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
  if (data === 'lb_daily') {
    const entries = buildLeaderboard('daily', 10);
    const text = formatLeaderboardMessage('daily', entries, uid);
    await sendOrEdit(bot, chatId, messageId, text, keyboards.leaderboardKeyboard(lang));
    return;
  }
  if (data === 'lb_weekly') {
    const entries = buildLeaderboard('weekly', 10);
    const text = formatLeaderboardMessage('weekly', entries, uid);
    await sendOrEdit(bot, chatId, messageId, text, keyboards.leaderboardKeyboard(lang));
    return;
  }
  if (data === 'menu_trending' || data === 'trending_refresh') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '🔍 Loading trending…',
      keyboards.trendingKeyboard(lang)
    );
    try {
      const items = await getTrendingTokens(10, data === 'trending_refresh');
      const text = formatTrendingMessage(items);
      await sendOrEdit(bot, chatId, messageId, text, keyboards.trendingKeyboard(lang));
    } catch {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        '⚠️ Could not load trending feed.',
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
      `✅ Claimed <b>${res.claimedSol.toFixed(4)} SOL</b>`,
      keyboards.rewardsKeyboard(lang)
    );
    return;
  }
  if (data === 'token_refresh') {
    const mint = session.pendingToken;
    if (!mint) {
      const s = screens.manualEntryScreen(lang);
      await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
      return;
    }
    try {
      const analysis = await scanToken(mint);
      const body = formatTokenAnalysisMessage(analysis);
      await sendOrEdit(bot, chatId, messageId, body, keyboards.tokenTradeKeyboard(lang));
    } catch {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        t(lang, 'manual.scan_fail'),
        keyboards.manualEntryKeyboard(lang)
      );
    }
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
  if (data === 'menu_tracker') {
    const s = screens.placeholderScreen(lang, 'tracker.title', 'tracker.body');
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_docs') {
    const url = env.DOCUMENTATION_URL || env.DOCS_URL;
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      url || t(lang, 'docs.missing'),
      keyboards.simpleNav(lang)
    );
    return;
  }
  if (data === 'menu_website') {
    const url = env.WEBSITE_URL;
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      url || t(lang, 'website.missing'),
      keyboards.simpleNav(lang)
    );
    return;
  }

  if (data.startsWith('manual_size_')) {
    const raw = data.replace('manual_size_', '');
    if (raw !== 'custom') {
      const size = parseFloat(raw);
      if (!Number.isNaN(size) && size > 0) updateSession(chatId, { buySize: size });
    }
    const s = screens.manualEntryScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'manual_buy') {
    const mint = session.pendingToken;
    if (!mint) {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        t(lang, 'manual.paste_first'),
        screens.manualEntryScreen(lang).keyboard
      );
      return;
    }
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `🟢 <b>CONFIRM BUY</b>\n\n<code>${mint}</code>\n💰 ${session.buySize} SOL\n\nProceed?`,
      keyboards.buyConfirmKeyboard(lang)
    );
    return;
  }
  if (data === 'manual_buy_confirm') {
    const mint = session.pendingToken;
    if (!mint) {
      await renderHome(bot, chatId, messageId, uid);
      return;
    }
    await sendOrEdit(bot, chatId, messageId, '⏳ Preparing trade…', [[]]);
    const result = await executeTrade({
      userId: uid,
      chatId,
      mint,
      side: 'BUY',
      amountSol: session.buySize,
      slippageBps: 50,
      takeProfitPct: 50,
      stopLossPct: -20,
      mode: session.paper ? 'PAPER' : 'LIVE',
    });
    if (result.state === 'CONFIRMED') {
      void admin.notifyTrade({
        userId: uid,
        side: 'BUY',
        symbol: mint.slice(0, 6),
        valueSol: result.inAmount ?? session.buySize,
        mode: session.paper ? 'PAPER' : 'LIVE',
        signature: result.signature,
      });
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `✅ <b>BUY CONFIRMED</b> ${session.paper ? '📄' : ''}\n\n` +
          `${result.inAmount?.toFixed(4)} SOL` +
          (result.signature ? `\n<code>${result.signature}</code>` : ''),
        keyboards.positionsKeyboard(lang)
      );
    } else {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `❌ Trade failed\n${result.error ?? ''}`,
        screens.manualEntryScreen(lang).keyboard
      );
    }
    return;
  }
  if (data === 'manual_buy_cancel' || data === 'manual_sell_cancel') {
    const s = screens.manualEntryScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'manual_sell') {
    const open = getOpenPositions(uid);
    if (open.length === 0) {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        '📭 No open positions.',
        keyboards.positionsKeyboard(lang)
      );
      return;
    }
    const pos = session.pendingToken
      ? open.find((p) => p.mint === session.pendingToken) ?? open[0]
      : open[0];
    updateSession(chatId, { pendingToken: pos.mint });
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `🔴 <b>SELL</b> ${pos.symbol}\nChoose %:`,
      keyboards.sellAmountKeyboard(lang)
    );
    return;
  }
  if (
    data.startsWith('manual_sell_') &&
    data !== 'manual_sell_confirm' &&
    data !== 'manual_sell_cancel'
  ) {
    const pctRaw = data.replace('manual_sell_', '');
    if (pctRaw !== 'custom') {
      const pct = parseInt(pctRaw, 10);
      if (!Number.isNaN(pct)) updateSession(chatId, { pendingSellPct: pct });
    }
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      'Confirm sell?',
      keyboards.sellConfirmKeyboard(lang)
    );
    return;
  }
  if (data === 'manual_sell_confirm') {
    const mint = session.pendingToken;
    const pct = session.pendingSellPct ?? 100;
    if (!mint) {
      await renderHome(bot, chatId, messageId, uid);
      return;
    }
    await sendOrEdit(bot, chatId, messageId, '⏳ Preparing sell…', [[]]);
    const result = await executeTrade({
      userId: uid,
      chatId,
      mint,
      side: 'SELL',
      percentage: pct,
      slippageBps: 50,
      mode: session.paper ? 'PAPER' : 'LIVE',
    });
    if (result.state === 'CONFIRMED') {
      void admin.notifyTrade({
        userId: uid,
        side: 'SELL',
        symbol: mint.slice(0, 6),
        valueSol: result.outAmount ?? 0,
        mode: session.paper ? 'PAPER' : 'LIVE',
        signature: result.signature,
      });
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `✅ <b>SELL CONFIRMED</b>\n${result.outAmount?.toFixed(4)} SOL`,
        keyboards.positionsKeyboard(lang)
      );
    } else {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `❌ Sell failed\n${result.error ?? ''}`,
        keyboards.positionsKeyboard(lang)
      );
    }
    return;
  }

  if (data === 'auto_toggle') {
    const next = !session.autoEnabled;
    updateSession(chatId, { autoEnabled: next });
    setAutoEnabled(
      uid,
      chatId,
      next,
      session.autoStrategy,
      session.paper ? 'PAPER' : 'LIVE'
    );
    const s = screens.autoTradeScreen(lang, next);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data.startsWith('auto_strategy_')) {
    const strategy = data.replace('auto_strategy_', '') as
      | 'careful'
      | 'balanced'
      | 'bold'
      | 'custom';
    updateSession(chatId, { autoStrategy: strategy });
    setAutoStrategy(uid, strategy);
    const detail = formatStrategyMessage(strategy, uid);
    const s = screens.autoTradeScreen(lang, session.autoEnabled);
    await sendOrEdit(bot, chatId, messageId, s.text + '\n\n' + detail, s.keyboard);
    return;
  }
  if (data === 'auto_customize' || data.startsWith('auto_cfg_')) {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '⚙️ Auto risk config',
      keyboards.autoConfigKeyboard(lang)
    );
    return;
  }

  if (data === 'wallet_refresh' || data === 'wallet_balance') {
    await renderWallet(bot, chatId, messageId, uid);
    return;
  }
  if (data === 'wallet_create') {
    try {
      if (wallet.hasWallet(uid)) {
        await sendOrEdit(
          bot,
          chatId,
          messageId,
          t(lang, 'wallet.exists'),
          keyboards.walletKeyboard(lang)
        );
        return;
      }
      const { publicKey } = await wallet.createWallet(uid);
      void admin.notifyWalletCreated(uid, publicKey);
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `✅ Wallet created\n<code>${publicKey}</code>`,
        keyboards.walletKeyboard(lang)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      await sendOrEdit(bot, chatId, messageId, `❌ ${msg}`, keyboards.walletKeyboard(lang));
    }
    return;
  }
  if (data === 'wallet_import') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      t(lang, 'wallet.import_prompt'),
      keyboards.walletKeyboard(lang)
    );
    updateSession(chatId, { lastScreen: 'await_import_key' });
    return;
  }
  if (data === 'wallet_export') {
    if (!wallet.hasWallet(uid)) {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        t(lang, 'wallet.none'),
        keyboards.walletKeyboard(lang)
      );
      return;
    }
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      t(lang, 'wallet.export_warn'),
      keyboards.exportKeyWarningKeyboard(lang)
    );
    return;
  }
  if (data === 'wallet_export_confirm') {
    try {
      const key = wallet.exportPrivateKeySecure(uid);
      await bot.sendMessage(chatId, `🔐 <code>${key}</code>`, { parse_mode: 'HTML' });
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        t(lang, 'wallet.export_ok'),
        keyboards.walletKeyboard(lang)
      );
    } catch {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        t(lang, 'wallet.export_fail'),
        keyboards.walletKeyboard(lang)
      );
    }
    return;
  }
  if (data === 'wallet_withdraw') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      t(lang, 'wallet.withdraw_prompt'),
      keyboards.walletKeyboard(lang)
    );
    updateSession(chatId, { lastScreen: 'await_withdraw' });
    return;
  }

  if (data === 'alerts_enable') {
    updateSession(chatId, { alerts: true });
    const s = screens.alertsScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'alerts_disable') {
    updateSession(chatId, { alerts: false });
    const s = screens.alertsScreen(lang);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  if (data === 'settings_buysize') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '💰 Max / buy size',
      keyboards.settingsBuySizeKeyboard(lang)
    );
    return;
  }
  if (data.startsWith('set_buysize_')) {
    const size = parseFloat(data.replace('set_buysize_', ''));
    if (!Number.isNaN(size) && size > 0) {
      updateSession(chatId, { buySize: size });
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `✅ Buy size: ${size} SOL`,
        keyboards.settingsSavedKeyboard(lang)
      );
      return;
    }
  }
  if (data === 'settings_paper') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '📄 Paper trading',
      keyboards.settingsPaperKeyboard(lang, session.paper)
    );
    return;
  }
  if (data === 'set_paper_toggle') {
    const next = !session.paper;
    updateSession(chatId, { paper: next });
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '📄 Paper trading',
      keyboards.settingsPaperKeyboard(lang, next)
    );
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

  if (session.lastScreen === 'await_referral' || session.onboardingStep === 'referral') {
    const res = applyReferral(uid, text);
    if (!res.ok) {
      await bot.sendMessage(chatId, t(lang, 'referral.invalid'));
      return;
    }
    updateSession(chatId, {
      referralCode: text,
      lastScreen: undefined,
      onboardingStep: 'activation',
    });
    await bot.sendMessage(chatId, t(lang, 'referral.ok'));
    const s = screens.activationScreen(lang ?? 'en');
    await bot.sendMessage(chatId, s.text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: s.keyboard },
    });
    return;
  }

  if (!isOnboarded(session)) {
    await bot.sendMessage(chatId, t(lang, 'gate.incomplete'));
    return;
  }

  if (session.lastScreen === 'await_import_key') {
    updateSession(chatId, { lastScreen: undefined });
    try {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
      } catch {
        /* */
      }
      const { publicKey } = await wallet.importWallet(uid, text);
      void admin.notifyWalletImported(uid, publicKey);
      await bot.sendMessage(
        chatId,
        `✅ Imported\n<code>${publicKey}</code>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboards.walletKeyboard(lang) },
        }
      );
    } catch {
      await bot.sendMessage(chatId, t(lang, 'wallet.invalid_key'), {
        reply_markup: { inline_keyboard: keyboards.walletKeyboard(lang) },
      });
    }
    return;
  }

  if (session.lastScreen === 'await_withdraw') {
    updateSession(chatId, { lastScreen: undefined });
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await bot.sendMessage(chatId, t(lang, 'wallet.withdraw_prompt'), {
        parse_mode: 'HTML',
      });
      return;
    }
    const [to, amtStr] = parts;
    const amount = parseFloat(amtStr);
    if (!isValidPublicKey(to) || Number.isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, t(lang, 'wallet.withdraw_fail'));
      return;
    }
    try {
      const { signature } = await wallet.withdrawSol(uid, to, amount);
      void admin.notifyWithdraw(uid, amount, to);
      await bot.sendMessage(
        chatId,
        `✅ Withdraw\n<code>${signature}</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : t(lang, 'wallet.withdraw_fail');
      await bot.sendMessage(chatId, `❌ ${m}`);
    }
    return;
  }

  if (isValidPublicKey(text) && text.length >= 32) {
    updateSession(chatId, { pendingToken: text });
    await bot.sendMessage(chatId, '🔍 Scanning…');
    try {
      const analysis = await scanToken(text);
      const body = formatTokenAnalysisMessage(analysis);
      await bot.sendMessage(chatId, body, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboards.tokenTradeKeyboard(lang),
        },
        disable_web_page_preview: true,
      });
    } catch {
      await bot.sendMessage(chatId, t(lang, 'manual.scan_fail'));
    }
    return;
  }

  const asNum = parseFloat(text);
  if (!Number.isNaN(asNum) && asNum > 0 && asNum < 1000) {
    updateSession(chatId, { buySize: asNum });
    await bot.sendMessage(chatId, `✅ Buy size: <b>${asNum} SOL</b>`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: screens.manualEntryScreen(lang ?? 'en').keyboard,
      },
    });
  }
}
