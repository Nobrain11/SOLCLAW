/**
 * Callback router — wires UI to wallet, scanner, paper/live trading.
 * pump.fun focused.
 */

import type TelegramBot from 'node-telegram-bot-api';
import { answerCallback, sendOrEdit } from './ui.js';
import * as screens from './screens.js';
import { getSession, updateSession } from './session.js';
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
import * as keyboards from './keyboards.js';
import { formatStrategyMessage } from '../services/strategies.js';
import { setAutoEnabled, setAutoStrategy } from '../services/auto.js';

async function renderHome(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  uid: number
): Promise<void> {
  const session = getSession(chatId);
  const open = countOpen(uid);
  const stats = getPnlStats(uid);
  const hasWallet = wallet.hasWallet(uid);
  const screen = screens.homeScreen({
    openPositions: open,
    realizedPnl: stats.realizedPnl,
    autoTrade: session.autoEnabled,
    alerts: session.alerts,
    paper: session.paper,
    buySize: session.buySize,
    takeProfit: 50,
    stopLoss: -20,
    walletConnected: hasWallet,
  });
  await sendOrEdit(bot, chatId, messageId, screen.text, screen.keyboard);
}

async function renderWallet(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  uid: number
): Promise<void> {
  try {
    const info = await wallet.getWalletInfo(uid);
    if (!info) {
      const screen = screens.walletScreen({
        address: '—',
        balance: 0,
        connected: false,
      });
      await sendOrEdit(bot, chatId, messageId, screen.text, screen.keyboard);
      return;
    }
    const screen = screens.walletScreen({
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
      '⚠️ <b>Wallet</b>\n\nSolana RPC temporarily unavailable.',
      keyboards.walletKeyboard()
    );
  }
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
  const session = getSession(chatId);
  if (uid) updateSession(chatId, { userId: uid });
  await answerCallback(bot, query);

  if (data === 'home') {
    await renderHome(bot, chatId, messageId, uid);
    return;
  }
  if (data === 'menu_manual') {
    const s = screens.manualEntryScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_auto') {
    const s = screens.autoTradeScreen(session.autoEnabled);
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
      const s = screens.positionsScreen(false);
      await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
      return;
    }
    const lines = open.map((p) => {
      const sign = p.unrealizedPnl >= 0 ? '+' : '';
      return (
        `• <b>${p.symbol}</b> [${p.mode}]\n` +
        `  Entry $${formatUsd(p.entryPrice, 8)} → $${formatUsd(p.currentPrice, 8)}\n` +
        `  PnL: ${sign}${p.unrealizedPnl.toFixed(4)} SOL`
      );
    });
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `📈 <b>OPEN POSITIONS</b> (${open.length})\n\n` + lines.join('\n\n'),
      keyboards.positionsKeyboard()
    );
    return;
  }
  if (data === 'menu_alerts') {
    const s = screens.alertsScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_settings') {
    const s = screens.settingsScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_pnl' || data === 'pnl_refresh') {
    const live = getPnlStats(uid, 'LIVE');
    const paper = getPnlStats(uid, 'PAPER');
    const text =
      `🏆 <b>PnL</b>\n\n` +
      `<b>LIVE</b>\n` +
      `Realized: ${live.realizedPnl >= 0 ? '+' : ''}${live.realizedPnl.toFixed(4)} SOL\n` +
      `Trades: ${live.trades}\n\n` +
      `<b>📄 PAPER</b>\n` +
      `Realized: ${paper.realizedPnl >= 0 ? '+' : ''}${paper.realizedPnl.toFixed(4)} SOL\n` +
      `Trades: ${paper.trades}`;
    await sendOrEdit(bot, chatId, messageId, text, keyboards.pnlKeyboard());
    return;
  }
  if (data === 'menu_history' || data === 'history_refresh') {
    const hist = getHistory(uid, undefined, 10);
    if (hist.length === 0) {
      const s = screens.historyScreen(false);
      await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
      return;
    }
    const lines = hist.map((t) => {
      const pnl =
        t.pnlSol != null
          ? ` · PnL ${t.pnlSol >= 0 ? '+' : ''}${t.pnlSol.toFixed(4)}`
          : '';
      return `• ${t.side} <b>${t.symbol}</b> [${t.mode}] ${t.valueSol.toFixed(4)} SOL${pnl}`;
    });
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `📜 <b>TRADE HISTORY</b>\n\n` + lines.join('\n'),
      keyboards.historyKeyboard()
    );
    return;
  }
  if (data === 'menu_security') {
    const s = screens.securityScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'menu_help') {
    const s = screens.helpScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  if (data.startsWith('manual_size_')) {
    const raw = data.replace('manual_size_', '');
    if (raw !== 'custom') {
      const size = parseFloat(raw);
      if (!Number.isNaN(size) && size > 0) {
        updateSession(chatId, { buySize: size });
      }
    }
    const s = screens.manualEntryScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'manual_change_size') {
    const s = screens.manualEntryScreen();
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
        '⚡ Paste a token address first.',
        screens.manualEntryScreen().keyboard
      );
      return;
    }
    const s = screens.buyConfirmScreen({
      token: mint.slice(0, 8) + '…',
      amount: session.buySize,
      slippage: 0.5,
      takeProfit: 50,
      stopLoss: -20,
    });
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'manual_buy_confirm') {
    const mint = session.pendingToken;
    if (!mint) {
      await renderHome(bot, chatId, messageId, uid);
      return;
    }
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      `⏳ Preparing trade...\n📄 Mode: ${session.paper ? 'PAPER' : 'LIVE'}`,
      [[]]
    );
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
      const text =
        `✅ <b>BUY CONFIRMED</b> ${session.paper ? '📄 PAPER' : ''}\n\n` +
        `Amount: ${result.inAmount?.toFixed(4)} SOL\n` +
        `Price: $${formatUsd(result.price ?? null, 8)}` +
        (result.signature ? `\n\nSig: <code>${result.signature}</code>` : '');
      await sendOrEdit(bot, chatId, messageId, text, keyboards.positionsKeyboard());
    } else {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `❌ <b>Trade failed</b>\n\n${result.error ?? 'Unknown'}`,
        screens.manualEntryScreen().keyboard
      );
    }
    return;
  }
  if (data === 'manual_buy_cancel' || data === 'manual_sell_cancel') {
    const s = screens.manualEntryScreen();
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
        keyboards.positionsKeyboard()
      );
      return;
    }
    const pos = session.pendingToken
      ? open.find((p) => p.mint === session.pendingToken) ?? open[0]
      : open[0];
    updateSession(chatId, { pendingToken: pos.mint });
    const s = screens.sellAmountScreen({
      token: pos.symbol,
      positionSol: pos.entrySol,
    });
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
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
    const s = screens.sellConfirmScreen({
      token: (session.pendingToken ?? 'TOKEN').slice(0, 8) + '…',
      positionSol: 0,
    });
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'manual_sell_confirm') {
    const mint = session.pendingToken;
    const pct = session.pendingSellPct ?? 100;
    if (!mint) {
      await renderHome(bot, chatId, messageId, uid);
      return;
    }
    await sendOrEdit(bot, chatId, messageId, '⏳ Preparing sell...', [[]]);
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
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `✅ <b>SELL CONFIRMED</b> ${session.paper ? '📄 PAPER' : ''}\n\n` +
          `Value: ${result.outAmount?.toFixed(4)} SOL`,
        keyboards.positionsKeyboard()
      );
    } else {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `❌ <b>Sell failed</b>\n\n${result.error ?? 'Unknown'}`,
        keyboards.positionsKeyboard()
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
    const s = screens.autoTradeScreen(next);
    const note = next
      ? '\n\n🟢 Engine ON — trades only when opportunities pass safety + risk.'
      : '\n\n🔴 Engine OFF';
    await sendOrEdit(bot, chatId, messageId, s.text + note, s.keyboard);
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
    const s = screens.autoTradeScreen(session.autoEnabled);
    await sendOrEdit(bot, chatId, messageId, s.text + '\n\n' + detail, s.keyboard);
    return;
  }
  if (data === 'auto_customize' || data.startsWith('auto_cfg_')) {
    const s = screens.autoConfigScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
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
          '⚠️ Wallet already exists.',
          keyboards.walletKeyboard()
        );
        return;
      }
      const { publicKey } = await wallet.createWallet(uid);
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        `✅ <b>Wallet created</b>\n\nAddress:\n<code>${publicKey}</code>`,
        keyboards.walletKeyboard()
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      await sendOrEdit(bot, chatId, messageId, `❌ ${msg}`, keyboards.walletKeyboard());
    }
    return;
  }
  if (data === 'wallet_import') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '📥 <b>Import Wallet</b>\n\nSend your private key as a message (base58).\nDelete the message after sending.',
      keyboards.walletKeyboard()
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
        '⚠️ No wallet to export.',
        keyboards.walletKeyboard()
      );
      return;
    }
    const s = screens.exportKeyWarningScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'wallet_export_confirm') {
    try {
      const key = wallet.exportPrivateKeySecure(uid);
      await bot.sendMessage(
        chatId,
        `🔐 <b>Private key</b> (delete this message):\n\n<code>${key}</code>`,
        { parse_mode: 'HTML' }
      );
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        '✅ Key sent. Delete it after saving offline.',
        keyboards.walletKeyboard()
      );
    } catch {
      await sendOrEdit(
        bot,
        chatId,
        messageId,
        '❌ Export failed.',
        keyboards.walletKeyboard()
      );
    }
    return;
  }
  if (data === 'wallet_withdraw') {
    await sendOrEdit(
      bot,
      chatId,
      messageId,
      '📤 <b>Withdraw</b>\n\nSend: <code>ADDRESS AMOUNT</code>',
      keyboards.walletKeyboard()
    );
    updateSession(chatId, { lastScreen: 'await_withdraw' });
    return;
  }

  if (data === 'alerts_enable') {
    updateSession(chatId, { alerts: true });
    const s = screens.alertsScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'alerts_disable') {
    updateSession(chatId, { alerts: false });
    const s = screens.alertsScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data.startsWith('alerts_')) {
    const s = screens.alertsScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  if (data === 'settings_buysize') {
    const s = screens.settingsBuySizeScreen(session.buySize);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data.startsWith('set_buysize_')) {
    const raw = data.replace('set_buysize_', '');
    if (raw !== 'custom') {
      const size = parseFloat(raw);
      if (!Number.isNaN(size) && size > 0) {
        updateSession(chatId, { buySize: size });
        const s = screens.valueSavedScreen('Buy size', `${size} SOL`);
        await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
        return;
      }
    }
  }
  if (data === 'settings_paper') {
    const s = screens.settingsPaperScreen(session.paper);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'set_paper_toggle') {
    const next = !session.paper;
    updateSession(chatId, { paper: next });
    const s = screens.settingsPaperScreen(next);
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data.startsWith('settings_') || data.startsWith('set_')) {
    const s = screens.settingsScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }
  if (data === 'security_safety') {
    const s = screens.securityScreen();
    await sendOrEdit(bot, chatId, messageId, s.text, s.keyboard);
    return;
  }

  await renderHome(bot, chatId, messageId, uid);
}

export async function handleStart(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  if (!msg.chat?.id) return;
  const chatId = msg.chat.id;
  const uid = msg.from?.id ?? 0;
  if (uid) updateSession(chatId, { userId: uid });
  await renderHome(bot, chatId, undefined, uid);
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

  if (session.lastScreen === 'await_import_key') {
    updateSession(chatId, { lastScreen: undefined });
    try {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      const { publicKey } = await wallet.importWallet(uid, text);
      await bot.sendMessage(
        chatId,
        `✅ <b>Wallet imported</b>\n\nAddress:\n<code>${publicKey}</code>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboards.walletKeyboard() },
        }
      );
    } catch {
      await bot.sendMessage(chatId, '❌ Invalid private key.', {
        reply_markup: { inline_keyboard: keyboards.walletKeyboard() },
      });
    }
    return;
  }

  if (session.lastScreen === 'await_withdraw') {
    updateSession(chatId, { lastScreen: undefined });
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await bot.sendMessage(chatId, '❌ Format: ADDRESS AMOUNT');
      return;
    }
    const [to, amtStr] = parts;
    const amount = parseFloat(amtStr);
    if (!isValidPublicKey(to) || Number.isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, '❌ Invalid address or amount.');
      return;
    }
    try {
      const { signature } = await wallet.withdrawSol(uid, to, amount);
      await bot.sendMessage(
        chatId,
        `✅ <b>Withdraw submitted</b>\n\n<code>${signature}</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Withdraw failed';
      await bot.sendMessage(chatId, `❌ ${m}`);
    }
    return;
  }

  if (isValidPublicKey(text) && text.length >= 32) {
    updateSession(chatId, { pendingToken: text });
    await bot.sendMessage(chatId, '🔍 Scanning token…');
    try {
      const analysis = await scanToken(text);
      const body = formatTokenAnalysisMessage(analysis);
      await bot.sendMessage(chatId, body, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboards.tokenAnalysisKeyboard() },
        disable_web_page_preview: true,
      });
    } catch {
      await bot.sendMessage(chatId, '⚠️ Could not scan token.');
    }
    return;
  }

  const asNum = parseFloat(text);
  if (!Number.isNaN(asNum) && asNum > 0 && asNum < 1000) {
    updateSession(chatId, { buySize: asNum });
    await bot.sendMessage(
      chatId,
      `✅ Buy size set to <b>${asNum} SOL</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: screens.manualEntryScreen().keyboard,
        },
      }
    );
  }
}
