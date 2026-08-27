/**
 * Inline keyboards — language-aware labels via t().
 * Callback data is language-independent.
 */

import type TelegramBot from 'node-telegram-bot-api';
import type { Language } from '../i18n/index.js';
import { t } from '../i18n/index.js';
import { env } from '../config/env.js';

type InlineKeyboard = TelegramBot.InlineKeyboardButton[][];

function btn(text: string, callback_data: string): TelegramBot.InlineKeyboardButton {
  return { text, callback_data };
}

function urlBtn(text: string, url: string): TelegramBot.InlineKeyboardButton {
  return { text, url };
}

export function languageKeyboard(): InlineKeyboard {
  return [
    [btn('🇬🇧 English', 'language_en'), btn('🇨🇳 中文', 'language_zh')],
    [btn('🇪🇸 Español', 'language_es')],
  ];
}

export function welcomeKeyboard(lang: Language | null): InlineKeyboard {
  const rows: InlineKeyboard = [];
  const web = env.WEBSITE_URL;
  const docs = env.DOCS_URL;
  const row1: TelegramBot.InlineKeyboardButton[] = [];
  if (web) row1.push(urlBtn(t(lang, 'welcome.website'), web));
  else row1.push(btn(t(lang, 'welcome.website'), 'menu_website'));
  if (docs) row1.push(urlBtn(t(lang, 'welcome.docs'), docs));
  else row1.push(btn(t(lang, 'welcome.docs'), 'menu_docs'));
  rows.push(row1);
  rows.push([btn(t(lang, 'welcome.continue'), 'onboard_continue')]);
  return rows;
}

export function referralKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'referral.enter'), 'referral_enter')],
    [btn(t(lang, 'referral.how'), 'referral_how')],
  ];
}

export function activationKeyboard(lang: Language | null): InlineKeyboard {
  return [[btn(t(lang, 'activation.enter'), 'onboard_enter_home')]];
}

export function homeKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [
      btn(t(lang, 'btn.auto'), 'menu_auto'),
      btn(t(lang, 'btn.manual'), 'menu_manual'),
      btn(t(lang, 'btn.trending'), 'menu_trending'),
    ],
    [
      btn(t(lang, 'btn.wallet'), 'menu_wallet'),
      btn(t(lang, 'btn.positions'), 'positions_open'),
      btn(t(lang, 'btn.tracker'), 'menu_tracker'),
    ],
    [
      btn(t(lang, 'btn.alerts'), 'menu_alerts'),
      btn(t(lang, 'btn.pnl'), 'menu_pnl'),
      btn(t(lang, 'btn.history'), 'menu_history'),
    ],
    [
      btn(t(lang, 'btn.leaderboard'), 'menu_leaderboard'),
      btn(t(lang, 'btn.settings'), 'menu_settings'),
      btn(t(lang, 'btn.security'), 'menu_security'),
    ],
    [
      btn(t(lang, 'btn.help'), 'menu_help'),
      btn(t(lang, 'btn.docs'), 'menu_docs'),
      btn(t(lang, 'btn.website'), 'menu_website'),
    ],
  ];
}

export function navRow(lang: Language | null, backCallback?: string): TelegramBot.InlineKeyboardButton[] {
  const row: TelegramBot.InlineKeyboardButton[] = [];
  if (backCallback) row.push(btn(t(lang, 'btn.back'), backCallback));
  row.push(btn(t(lang, 'btn.home'), 'home'));
  return row;
}

export function manualEntryKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('💰 0.01 SOL', 'manual_size_0.01'), btn('💰 0.05 SOL', 'manual_size_0.05')],
    [btn('💰 0.10 SOL', 'manual_size_0.10'), btn('💰 0.25 SOL', 'manual_size_0.25')],
    [btn(t(lang, 'btn.settings'), 'menu_settings')],
    navRow(lang),
  ];
}

export function tokenAnalysisKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'manual.buy'), 'manual_buy'), btn(t(lang, 'manual.sell'), 'manual_sell')],
    navRow(lang, 'menu_manual'),
  ];
}

export function buyConfirmKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'manual.confirm_buy'), 'manual_buy_confirm'), btn(t(lang, 'manual.cancel'), 'manual_buy_cancel')],
    navRow(lang, 'menu_manual'),
  ];
}

export function sellAmountKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('25%', 'manual_sell_25'), btn('50%', 'manual_sell_50')],
    [btn('75%', 'manual_sell_75'), btn('100%', 'manual_sell_100')],
    navRow(lang, 'menu_manual'),
  ];
}

export function sellConfirmKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'manual.confirm_sell'), 'manual_sell_confirm'), btn(t(lang, 'manual.cancel'), 'manual_sell_cancel')],
    navRow(lang, 'menu_manual'),
  ];
}

export function autoTradeKeyboard(lang: Language | null, enabled: boolean): InlineKeyboard {
  const enableLabel = enabled ? t(lang, 'auto.disable') : t(lang, 'auto.enable');
  return [
    [btn(t(lang, 'auto.careful'), 'auto_strategy_careful'), btn(t(lang, 'auto.balanced'), 'auto_strategy_balanced')],
    [btn(t(lang, 'auto.bold'), 'auto_strategy_bold'), btn(t(lang, 'auto.custom'), 'auto_strategy_custom')],
    [btn(enableLabel, 'auto_toggle'), btn(t(lang, 'auto.customize'), 'auto_customize')],
    navRow(lang),
  ];
}

export function autoConfigKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('💰 Risk', 'auto_cfg_risk'), btn('🎯 TP', 'auto_cfg_tp')],
    [btn('🛑 SL', 'auto_cfg_sl'), btn('📊 Max', 'auto_cfg_maxpos')],
    navRow(lang, 'menu_auto'),
  ];
}

export function walletKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'wallet.refresh'), 'wallet_refresh'), btn(t(lang, 'wallet.create'), 'wallet_create')],
    [btn(t(lang, 'wallet.import'), 'wallet_import'), btn(t(lang, 'wallet.withdraw'), 'wallet_withdraw')],
    [btn(t(lang, 'wallet.export'), 'wallet_export')],
    navRow(lang),
  ];
}

export function exportKeyWarningKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'common.yes'), 'wallet_export_confirm')],
    [btn(t(lang, 'manual.cancel'), 'menu_wallet'), btn(t(lang, 'btn.home'), 'home')],
  ];
}

export function positionsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'common.refresh'), 'positions_refresh'), btn(t(lang, 'btn.pnl'), 'menu_pnl')],
    navRow(lang),
  ];
}

export function alertsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🟢', 'alerts_enable'), btn('🔴', 'alerts_disable')],
    navRow(lang),
  ];
}

export function settingsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'settings.language'), 'settings_language'), btn(t(lang, 'settings.buysize'), 'settings_buysize')],
    [btn(t(lang, 'settings.paper'), 'settings_paper')],
    navRow(lang),
  ];
}

export function settingsLanguageKeyboard(): InlineKeyboard {
  return languageKeyboard();
}

export function settingsBuySizeKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('0.01', 'set_buysize_0.01'), btn('0.05', 'set_buysize_0.05')],
    [btn('0.10', 'set_buysize_0.10'), btn('0.25', 'set_buysize_0.25')],
    navRow(lang, 'menu_settings'),
  ];
}

export function settingsPaperKeyboard(lang: Language | null, enabled: boolean): InlineKeyboard {
  const label = enabled ? '🔴 OFF' : '🟢 ON';
  return [[btn(label, 'set_paper_toggle')], navRow(lang, 'menu_settings')];
}

export function settingsSavedKeyboard(lang: Language | null): InlineKeyboard {
  return [[btn(t(lang, 'btn.settings'), 'menu_settings'), btn(t(lang, 'btn.home'), 'home')]];
}

export function pnlKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'common.refresh'), 'pnl_refresh'), btn(t(lang, 'btn.history'), 'menu_history')],
    navRow(lang),
  ];
}

export function historyKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'common.refresh'), 'history_refresh'), btn(t(lang, 'btn.pnl'), 'menu_pnl')],
    navRow(lang),
  ];
}

export function securityKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'wallet.export'), 'wallet_export'), btn(t(lang, 'btn.wallet'), 'menu_wallet')],
    navRow(lang),
  ];
}

export function helpKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn(t(lang, 'btn.manual'), 'menu_manual'), btn(t(lang, 'btn.auto'), 'menu_auto')],
    navRow(lang),
  ];
}

export function leaderboardKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [
      btn(t(lang, 'leaderboard.daily'), 'lb_daily'),
      btn(t(lang, 'leaderboard.weekly'), 'lb_weekly'),
      btn(t(lang, 'leaderboard.all'), 'lb_all'),
    ],
    navRow(lang),
  ];
}

export function simpleNav(lang: Language | null): InlineKeyboard {
  return [navRow(lang)];
}
