/**
 * SOL CLAW premium screens — dense trading terminal style.
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { Language } from '../i18n/index.js';
import { t } from '../i18n/index.js';
import * as keyboards from './keyboards.js';

export type Screen = {
  text: string;
  keyboard: TelegramBot.InlineKeyboardButton[][];
};

export function languageScreen(): Screen {
  return {
    text:
      `🌍 <b>Welcome to SOL CLAW</b>\n\n` +
      `Choose your language:\n\n` +
      `🇬🇧 English · 🇨🇳 中文 · 🇪🇸 Español`,
    keyboard: keyboards.languageKeyboard(),
  };
}

export function welcomeScreen(lang: Language): Screen {
  return {
    text:
      `🐾 <b>SOL CLAW</b>\n\n` +
      `Your Solana trading terminal.\n\n` +
      `• Manual & auto trading\n` +
      `• Positions, TP/SL, alerts\n` +
      `• Wallet tracker & rewards\n\n` +
      `Trade pump.fun with risk controls.`,
    keyboard: keyboards.welcomeKeyboard(lang),
  };
}

export function referralScreen(lang: Language | null): Screen {
  return {
    text:
      `🔗 <b>REFERRAL REQUIRED</b>\n\n` +
      `SOL CLAW requires a valid invitation to continue.\n\n` +
      `Open an invite link or enter a code:\n` +
      `<code>/start r_CODE</code>`,
    keyboard: keyboards.referralKeyboard(lang),
  };
}

export function activationScreen(lang: Language): Screen {
  return {
    text:
      `✅ <b>ACCOUNT READY</b>\n\n` +
      `Welcome to SOL CLAW.\n` +
      `Your account is activated.`,
    keyboard: keyboards.activationKeyboard(lang),
  };
}

export function homeScreen(
  lang: Language,
  state: {
    openPositions: number;
    realizedPnl: number;
    autoTrade: boolean;
    alerts: boolean;
    paper: boolean;
    buySize: number;
    takeProfit: number;
    stopLoss: number;
    walletConnected: boolean;
    portfolioSol?: number;
    solPriceLine?: string;
  }
): Screen {
  const pnlSign = state.realizedPnl >= 0 ? '+' : '';
  const on = '🟢';
  const off = '🔴';
  const solLine = state.solPriceLine ?? '◎ SOL —';
  const portfolio = (state.portfolioSol ?? 0).toFixed(4);
  const text =
    `🐾 <b>SOL CLAW</b>\n\n` +
    `${solLine}\n\n` +
    `💼 <b>Portfolio</b>\n` +
    `${portfolio} SOL\n\n` +
    `📊 Open Positions: <b>${state.openPositions}</b>\n` +
    `🏆 PnL: <b>${pnlSign}${state.realizedPnl.toFixed(4)} SOL</b>\n\n` +
    `🤖 Auto ${state.autoTrade ? on : off}  ·  ` +
    `🔔 Alerts ${state.alerts ? on : off}  ·  ` +
    `📄 Paper ${state.paper ? on : off}\n` +
    `💰 Buy ${state.buySize} · 🎯 TP +${state.takeProfit}% · 🛑 SL ${state.stopLoss}%\n` +
    `🔐 Wallet: ${state.walletConnected ? 'Connected' : 'Not connected'}`;

  return { text, keyboard: keyboards.homeKeyboard(lang) };
}

export function manualEntryScreen(lang: Language): Screen {
  return {
    text:
      `⚡ <b>MANUAL TRADE</b>\n\n` +
      `Paste a Solana / pump.fun contract address.\n\n` +
      `We validate address, liquidity, risk & market data.`,
    keyboard: keyboards.manualEntryKeyboard(lang),
  };
}

export function autoTradeScreen(lang: Language, enabled: boolean): Screen {
  const status = enabled ? '🟢 ON' : '🔴 OFF';
  return {
    text:
      `🤖 <b>AUTO TRADE</b>\n\n` +
      `Status: <b>${status}</b>\n\n` +
      `Choose strategy:\n` +
      `🛡 Careful · ⚖️ Balanced · 🚀 Bold · 🧠 Custom`,
    keyboard: keyboards.autoTradeKeyboard(lang, enabled),
  };
}

export function walletScreen(
  lang: Language,
  data: { address: string; balance: number; connected: boolean }
): Screen {
  const short =
    data.address && data.address.length > 12
      ? `${data.address.slice(0, 4)}…${data.address.slice(-4)}`
      : data.address || '—';
  return {
    text:
      `💼 <b>WALLET</b>\n\n` +
      `Address: <code>${short}</code>\n` +
      (data.connected ? `<code>${data.address}</code>\n\n` : '\n') +
      `Balance: <b>◎ ${data.balance.toFixed(4)} SOL</b>\n` +
      `Status: ${data.connected ? '🔐 Connected' : 'Not connected'}`,
    keyboard: keyboards.walletKeyboard(lang),
  };
}

export function settingsScreen(lang: Language): Screen {
  return {
    text: `⚙️ <b>SETTINGS</b>\n\nBuy size, paper mode, language, risk.`,
    keyboard: keyboards.settingsKeyboard(lang),
  };
}

export function helpScreen(lang: Language): Screen {
  return {
    text:
      `❓ <b>HELP</b>\n\n` +
      `⚡ Manual — paste CA, scan, buy/sell\n` +
      `🤖 Auto — strategy within risk limits\n` +
      `💼 Wallet — create, import, withdraw\n` +
      `🎁 Rewards — referral + cashback`,
    keyboard: keyboards.helpKeyboard(lang),
  };
}

export function securityScreen(lang: Language): Screen {
  return {
    text:
      `🔐 <b>SECURITY</b>\n\n` +
      `• Keys encrypted at rest (AES-256-GCM)\n` +
      `• Export requires double confirmation\n` +
      `• Never shared in logs or errors\n` +
      `• All trades need explicit confirm`,
    keyboard: keyboards.securityKeyboard(lang),
  };
}

export function alertsScreen(lang: Language): Screen {
  return {
    text: `🔔 <b>ALERTS</b>\n\nToken · price · position · wallet alerts.`,
    keyboard: keyboards.alertsKeyboard(lang),
  };
}

export function positionsEmptyScreen(lang: Language): Screen {
  return {
    text: `📈 <b>POSITIONS</b>\n\nNo open positions.`,
    keyboard: keyboards.positionsKeyboard(lang),
  };
}

export function placeholderScreen(
  lang: Language,
  titleKey: string,
  bodyKey: string
): Screen {
  return {
    text: `${t(lang, titleKey)}\n\n${t(lang, bodyKey)}`,
    keyboard: keyboards.simpleNav(lang),
  };
}
