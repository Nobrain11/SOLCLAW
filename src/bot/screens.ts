/**
 * SOL CLAW screens — compact terminal style
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
    text: `🐾 <b>SOL CLAW</b>\n\nChoose language / 选择语言 / Idioma`,
    keyboard: keyboards.languageKeyboard(),
  };
}

export function welcomeScreen(lang: Language): Screen {
  return {
    text:
      `🐾 <b>SOL CLAW</b>\n\n` +
      `Solana · Pump.fun trading terminal.`,
    keyboard: keyboards.welcomeKeyboard(lang),
  };
}

export function referralScreen(lang: Language | null): Screen {
  return {
    text:
      `🔗 <b>Referral</b> (optional)\n\n` +
      `Enter a code if you have one, or continue trading.`,
    keyboard: keyboards.referralKeyboard(lang),
  };
}

export function activationScreen(lang: Language): Screen {
  return {
    text: `✅ Ready. Enter the terminal.`,
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
  const solLine = state.solPriceLine ?? '◎ SOL —';
  const portfolio = (state.portfolioSol ?? 0).toFixed(4);
  const text =
    `🐾 <b>SOL CLAW</b>\n` +
    `<i>Pump.fun · Solana</i>\n\n` +
    `${solLine}\n` +
    `━━━━━━━━━━━━\n` +
    `◎ <b>${portfolio}</b> SOL\n` +
    `Open ${state.openPositions} · PnL ${pnlSign}${state.realizedPnl.toFixed(4)}\n` +
    `Buy ${state.buySize} · TP +${state.takeProfit}% · SL ${state.stopLoss}%\n` +
    `Auto ${state.autoTrade ? 'ON' : 'OFF'} · Paper ${state.paper ? 'ON' : 'OFF'}\n` +
    `Wallet ${state.walletConnected ? 'connected' : '—'}`;

  return { text, keyboard: keyboards.homeKeyboard(lang) };
}

export function manualEntryScreen(lang: Language): Screen {
  return {
    text:
      `⚡ <b>Trade</b>\n\n` +
      `Paste a pump.fun / Solana mint.`,
    keyboard: keyboards.manualEntryKeyboard(lang),
  };
}

export function autoTradeScreen(lang: Language, enabled: boolean): Screen {
  const status = enabled ? 'ON' : 'OFF';
  return {
    text: `🤖 <b>Auto</b> · ${status}\n\nPick a strategy, then start.`,
    keyboard: keyboards.autoTradeKeyboard(lang, enabled),
  };
}

export function walletScreen(
  lang: Language,
  data: { address: string; balance: number; connected: boolean }
): Screen {
  return {
    text:
      `💼 <b>Wallet</b>\n\n` +
      (data.connected
        ? `<code>${data.address}</code>\n\n◎ <b>${data.balance.toFixed(4)}</b> SOL`
        : `No wallet yet.\nCreate or import one.`),
    keyboard: keyboards.walletKeyboard(lang),
  };
}

export function settingsScreen(lang: Language): Screen {
  return {
    text: `⚙️ <b>Setup</b>\n\nLanguage · buy size · paper mode`,
    keyboard: keyboards.settingsKeyboard(lang),
  };
}

export function helpScreen(lang: Language): Screen {
  return {
    text:
      `❓ <b>Help</b>\n\n` +
      `Trade — paste mint, buy/sell\n` +
      `Pump.fun — live coin feed\n` +
      `Wallet — create / import\n` +
      `← Return goes back one screen`,
    keyboard: keyboards.helpKeyboard(lang),
  };
}

export function securityScreen(lang: Language): Screen {
  return {
    text:
      `🔐 <b>Security</b>\n\n` +
      `Keys encrypted (AES-256-GCM)\n` +
      `Never logged · confirm every live trade`,
    keyboard: keyboards.securityKeyboard(lang),
  };
}

export function alertsScreen(lang: Language): Screen {
  return {
    text: `🔔 <b>Alerts</b>`,
    keyboard: keyboards.alertsKeyboard(lang),
  };
}

export function positionsEmptyScreen(lang: Language): Screen {
  return {
    text: `📈 <b>Positions</b>\n\nNone open.`,
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
