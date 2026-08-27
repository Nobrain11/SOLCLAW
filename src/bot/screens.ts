/**
 * Screen composition using i18n.
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
    text: `${t(null, 'lang.title')}\n\n${t(null, 'lang.subtitle')}`,
    keyboard: keyboards.languageKeyboard(),
  };
}

export function welcomeScreen(lang: Language): Screen {
  return {
    text: `${t(lang, 'welcome.title')}\n\n${t(lang, 'welcome.body')}`,
    keyboard: keyboards.welcomeKeyboard(lang),
  };
}

export function referralScreen(lang: Language | null): Screen {
  return {
    text: `${t(lang, 'referral.title')}\n\n${t(lang, 'referral.body')}`,
    keyboard: keyboards.referralKeyboard(lang),
  };
}

export function activationScreen(lang: Language): Screen {
  return {
    text: `${t(lang, 'activation.title')}\n\n${t(lang, 'activation.body')}`,
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
  }
): Screen {
  const pnlSign = state.realizedPnl >= 0 ? '+' : '';
  const on = t(lang, 'home.on');
  const off = t(lang, 'home.off');
  const text =
    `${t(lang, 'home.title')}\n\n` +
    `${t(lang, 'home.open')}: <b>${state.openPositions}</b>\n` +
    `${t(lang, 'home.realized')}: <b>${pnlSign}${state.realizedPnl.toFixed(2)} SOL</b>\n\n` +
    `${t(lang, 'home.setup')}\n\n` +
    `${t(lang, 'home.auto')}: ${state.autoTrade ? on : off}\n` +
    `${t(lang, 'home.alerts')}: ${state.alerts ? on : off}\n` +
    `${t(lang, 'home.paper')}: ${state.paper ? on : off}\n\n` +
    `${t(lang, 'home.buy')}: <b>${state.buySize} SOL</b>\n` +
    `${t(lang, 'home.tp')}: <b>+${state.takeProfit}%</b>\n` +
    `${t(lang, 'home.sl')}: <b>${state.stopLoss}%</b>\n\n` +
    `${t(lang, 'home.wallet')}: <b>${
      state.walletConnected
        ? t(lang, 'home.wallet.connected')
        : t(lang, 'home.wallet.none')
    }</b>\n\n` +
    t(lang, 'home.choose');

  return { text, keyboard: keyboards.homeKeyboard(lang) };
}

export function manualEntryScreen(lang: Language): Screen {
  return {
    text: `${t(lang, 'manual.title')}\n\n${t(lang, 'manual.body')}`,
    keyboard: keyboards.manualEntryKeyboard(lang),
  };
}

export function autoTradeScreen(lang: Language, enabled: boolean): Screen {
  const status = enabled ? t(lang, 'home.on') : t(lang, 'home.off');
  return {
    text:
      `${t(lang, 'auto.title')}\n\n` +
      `${t(lang, 'auto.status')}\n\n${status}\n\n` +
      t(lang, 'auto.choose'),
    keyboard: keyboards.autoTradeKeyboard(lang, enabled),
  };
}

export function walletScreen(
  lang: Language,
  data: { address: string; balance: number; connected: boolean }
): Screen {
  const status = data.connected
    ? t(lang, 'home.wallet.connected')
    : t(lang, 'home.wallet.none');
  return {
    text:
      `${t(lang, 'wallet.title')}\n\n` +
      `${t(lang, 'wallet.address')}\n<code>${data.address || '—'}</code>\n\n` +
      `${t(lang, 'wallet.balance')}\n◎ ${data.balance.toFixed(4)} SOL\n\n` +
      `${t(lang, 'wallet.status')}\n🔐 ${status}`,
    keyboard: keyboards.walletKeyboard(lang),
  };
}

export function settingsScreen(lang: Language): Screen {
  return {
    text: `${t(lang, 'settings.title')}\n\n${t(lang, 'settings.body')}`,
    keyboard: keyboards.settingsKeyboard(lang),
  };
}

export function helpScreen(lang: Language): Screen {
  return {
    text: `${t(lang, 'help.title')}\n\n${t(lang, 'help.body')}`,
    keyboard: keyboards.helpKeyboard(lang),
  };
}

export function securityScreen(lang: Language): Screen {
  return {
    text: t(lang, 'security.title'),
    keyboard: keyboards.securityKeyboard(lang),
  };
}

export function alertsScreen(lang: Language): Screen {
  return {
    text: t(lang, 'alerts.title'),
    keyboard: keyboards.alertsKeyboard(lang),
  };
}

export function positionsEmptyScreen(lang: Language): Screen {
  return {
    text: `${t(lang, 'positions.title')}\n\n${t(lang, 'positions.empty')}`,
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
