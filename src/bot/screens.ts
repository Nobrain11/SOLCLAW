/**
 * Screen composition: text + keyboard.
 */

import * as messages from './messages.js';
import * as keyboards from './keyboards.js';
import type TelegramBot from 'node-telegram-bot-api';

export type Screen = {
  text: string;
  keyboard: TelegramBot.InlineKeyboardButton[][];
};

export const DEFAULT_HOME_STATE = {
  openPositions: 0,
  realizedPnl: 0,
  autoTrade: false,
  alerts: false,
  paper: false,
  buySize: 0.05,
  takeProfit: 50,
  stopLoss: -20,
  walletConnected: false,
};

export function homeScreen(state = DEFAULT_HOME_STATE): Screen {
  return {
    text: messages.homeMessage(state),
    keyboard: keyboards.homeKeyboard(),
  };
}

export function manualEntryScreen(): Screen {
  return {
    text: messages.MANUAL_ENTRY,
    keyboard: keyboards.manualEntryKeyboard(),
  };
}

export function tokenAnalysisScreen(data: {
  name: string;
  price: string;
  marketCap: string;
  liquidity: string;
  safety: string;
  change24h: string;
}): Screen {
  return {
    text: messages.tokenAnalysisMessage(data),
    keyboard: keyboards.tokenAnalysisKeyboard(),
  };
}

export function buyConfirmScreen(data: {
  token: string;
  amount: number;
  slippage: number;
  takeProfit: number;
  stopLoss: number;
}): Screen {
  return {
    text: messages.buyConfirmMessage(data),
    keyboard: keyboards.buyConfirmKeyboard(),
  };
}

export function sellAmountScreen(data: {
  token: string;
  positionSol: number;
}): Screen {
  return {
    text: messages.sellConfirmMessage(data),
    keyboard: keyboards.sellAmountKeyboard(),
  };
}

export function sellConfirmScreen(data: {
  token: string;
  positionSol: number;
}): Screen {
  return {
    text: messages.sellConfirmMessage(data) + '\n\nConfirm final sell?',
    keyboard: keyboards.sellConfirmKeyboard(),
  };
}

export function autoTradeScreen(enabled: boolean): Screen {
  return {
    text: messages.autoTradeMessage(enabled),
    keyboard: keyboards.autoTradeKeyboard(enabled),
  };
}

export function autoConfigScreen(): Screen {
  return {
    text: `⚙️ <b>AUTO CONFIGURATION</b>\n\nAdjust risk parameters.\nAll strategies still respect global safety controls.`,
    keyboard: keyboards.autoConfigKeyboard(),
  };
}

export function walletScreen(data?: {
  address: string;
  balance: number;
  connected: boolean;
}): Screen {
  if (!data) {
    return {
      text: messages.WALLET_PLACEHOLDER,
      keyboard: keyboards.walletKeyboard(),
    };
  }
  return {
    text: messages.walletMessage(data),
    keyboard: keyboards.walletKeyboard(),
  };
}

export function exportKeyWarningScreen(): Screen {
  return {
    text: messages.EXPORT_KEY_WARNING,
    keyboard: keyboards.exportKeyWarningKeyboard(),
  };
}

export function positionsScreen(hasPositions: boolean): Screen {
  return {
    text: hasPositions
      ? messages.positionsHeader() + '\n(Positions will be listed here.)'
      : messages.POSITIONS_EMPTY,
    keyboard: keyboards.positionsKeyboard(),
  };
}

export function alertsScreen(): Screen {
  return {
    text: messages.ALERTS_SCREEN,
    keyboard: keyboards.alertsKeyboard(),
  };
}

export function settingsScreen(): Screen {
  return {
    text: messages.SETTINGS_SCREEN,
    keyboard: keyboards.settingsKeyboard(),
  };
}

export function pnlScreen(data?: {
  openPnl: number;
  realizedPnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}): Screen {
  const d = data ?? {
    openPnl: 0,
    realizedPnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
  };
  return {
    text: messages.pnlMessage(d),
    keyboard: keyboards.pnlKeyboard(),
  };
}

export function historyScreen(hasHistory: boolean): Screen {
  return {
    text: hasHistory
      ? `📜 <b>TRADE HISTORY</b>\n\n(History entries will appear here.)`
      : messages.HISTORY_EMPTY,
    keyboard: keyboards.historyKeyboard(),
  };
}

export function securityScreen(): Screen {
  return {
    text: messages.SECURITY_SCREEN,
    keyboard: keyboards.securityKeyboard(),
  };
}

export function helpScreen(): Screen {
  return {
    text: messages.HELP_SCREEN,
    keyboard: keyboards.helpKeyboard(),
  };
}

export function settingsBuySizeScreen(current: number): Screen {
  return {
    text: messages.settingsBuySizeMessage(current),
    keyboard: keyboards.settingsBuySizeKeyboard(),
  };
}

export function settingsSlippageScreen(current: number): Screen {
  return {
    text: messages.settingsSlippageMessage(current),
    keyboard: keyboards.settingsSlippageKeyboard(),
  };
}

export function settingsTpScreen(current: number): Screen {
  return {
    text: messages.settingsTpMessage(current),
    keyboard: keyboards.settingsTpKeyboard(),
  };
}

export function settingsSlScreen(current: number): Screen {
  return {
    text: messages.settingsSlMessage(current),
    keyboard: keyboards.settingsSlKeyboard(),
  };
}

export function settingsPaperScreen(enabled: boolean): Screen {
  return {
    text: messages.settingsPaperMessage(enabled),
    keyboard: keyboards.settingsPaperKeyboard(enabled),
  };
}

export function valueSavedScreen(label: string, value: string): Screen {
  return {
    text: messages.valueSavedMessage(label, value),
    keyboard: keyboards.settingsSavedKeyboard(),
  };
}
