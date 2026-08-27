/**
 * SOL CLAW inline keyboards — premium hierarchy.
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
  const docs = env.DOCUMENTATION_URL || env.DOCS_URL;
  const row1: TelegramBot.InlineKeyboardButton[] = [];
  if (web) row1.push(urlBtn(t(lang, 'welcome.website'), web));
  else row1.push(btn(t(lang, 'welcome.website'), 'menu_website'));
  if (docs) row1.push(urlBtn('📖 Docs', docs));
  else row1.push(btn('📖 Docs', 'menu_docs'));
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
    [btn('🤖 AUTO TRADE', 'menu_auto'), btn('⚡ BUY / SELL', 'menu_manual')],
    [btn('🔥 TRENDING', 'menu_trending'), btn('📈 POSITIONS', 'positions_open')],
    [btn('💼 WALLET', 'menu_wallet'), btn('🔔 ALERTS', 'menu_alerts')],
    [btn('🏆 PNL', 'menu_pnl'), btn('🔭 TRACKER', 'menu_tracker')],
    [btn('🎁 REWARDS', 'menu_rewards'), btn('🏆 BOARD', 'menu_leaderboard')],
    [btn('⚙️ SETTINGS', 'menu_settings'), btn('🔐 SECURITY', 'menu_security')],
    [btn('📖 DOCS', 'menu_docs'), btn('🌍 LANG', 'settings_language'), btn('❓ HELP', 'menu_help')],
  ];
}

export function navRow(lang: Language | null, backCallback?: string): TelegramBot.InlineKeyboardButton[] {
  const row: TelegramBot.InlineKeyboardButton[] = [];
  if (backCallback) row.push(btn('🔙 BACK', backCallback));
  row.push(btn('🏠 HOME', 'home'));
  return row;
}

export function manualEntryKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('◎ 0.01', 'manual_size_0.01'), btn('◎ 0.05', 'manual_size_0.05'), btn('◎ 0.10', 'manual_size_0.10'), btn('◎ 0.25', 'manual_size_0.25')],
    [btn('⚙️ SETTINGS', 'menu_settings')],
    navRow(lang),
  ];
}

export function tokenTradeKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🟢 BUY', 'manual_buy'), btn('🔴 SELL', 'manual_sell')],
    [btn('◎ 0.01', 'manual_size_0.01'), btn('◎ 0.05', 'manual_size_0.05'), btn('◎ 0.10', 'manual_size_0.10'), btn('◎ 0.25', 'manual_size_0.25')],
    [btn('🎯 MAX BUY', 'settings_buysize'), btn('🔄 REFRESH', 'token_refresh')],
    [btn('🤖 AUTO', 'menu_auto'), btn('🔭 TRACK', 'menu_tracker')],
    navRow(lang, 'menu_manual'),
  ];
}

export function tokenAnalysisKeyboard(lang: Language | null): InlineKeyboard {
  return tokenTradeKeyboard(lang);
}

export function buyConfirmKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🟢 CONFIRM BUY', 'manual_buy_confirm'), btn('🔙 CANCEL', 'manual_buy_cancel')],
    navRow(lang, 'menu_manual'),
  ];
}

export function sellAmountKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('25%', 'manual_sell_25'), btn('50%', 'manual_sell_50'), btn('75%', 'manual_sell_75'), btn('100%', 'manual_sell_100')],
    navRow(lang, 'menu_manual'),
  ];
}

export function sellConfirmKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔴 CONFIRM SELL', 'manual_sell_confirm'), btn('🔙 CANCEL', 'manual_sell_cancel')],
    navRow(lang, 'menu_manual'),
  ];
}

export function autoTradeKeyboard(lang: Language | null, enabled: boolean): InlineKeyboard {
  const enableLabel = enabled ? '🔴 STOP AUTO' : '🟢 START AUTO';
  return [
    [btn('🛡 Careful', 'auto_strategy_careful'), btn('⚖️ Balanced', 'auto_strategy_balanced')],
    [btn('🚀 Bold', 'auto_strategy_bold'), btn('🧠 Custom', 'auto_strategy_custom')],
    [btn(enableLabel, 'auto_toggle'), btn('⚙️ Customize', 'auto_customize')],
    [btn('📈 Positions', 'positions_open'), btn('🏆 Results', 'menu_pnl')],
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
    [btn('🔄 Refresh', 'wallet_refresh'), btn('➕ Create', 'wallet_create')],
    [btn('📥 Import', 'wallet_import'), btn('💸 Withdraw', 'wallet_withdraw')],
    [btn('🔐 Security', 'menu_security')],
    navRow(lang),
  ];
}

export function exportKeyWarningKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('✅ I understand — export', 'wallet_export_confirm')],
    [btn('🔙 Cancel', 'menu_wallet'), btn('🏠 HOME', 'home')],
  ];
}

export function positionsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'positions_refresh'), btn('🏆 PnL', 'menu_pnl')],
    navRow(lang),
  ];
}

export function alertsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🟢 ON', 'alerts_enable'), btn('🔴 OFF', 'alerts_disable')],
    navRow(lang),
  ];
}

export function settingsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🌍 Language', 'settings_language'), btn('💰 Buy size', 'settings_buysize')],
    [btn('📄 Paper', 'settings_paper')],
    navRow(lang),
  ];
}

export function settingsLanguageKeyboard(): InlineKeyboard {
  return languageKeyboard();
}

export function settingsBuySizeKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('0.05', 'set_buysize_0.05'), btn('0.10', 'set_buysize_0.10'), btn('0.25', 'set_buysize_0.25'), btn('0.50', 'set_buysize_0.50')],
    [btn('1.00', 'set_buysize_1.00')],
    navRow(lang, 'menu_settings'),
  ];
}

export function settingsPaperKeyboard(lang: Language | null, enabled: boolean): InlineKeyboard {
  const label = enabled ? '🔴 OFF' : '🟢 ON';
  return [[btn(label, 'set_paper_toggle')], navRow(lang, 'menu_settings')];
}

export function settingsSavedKeyboard(lang: Language | null): InlineKeyboard {
  return [[btn('⚙️ Settings', 'menu_settings'), btn('🏠 HOME', 'home')]];
}

export function pnlKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'pnl_refresh'), btn('📜 History', 'menu_history')],
    navRow(lang),
  ];
}

export function historyKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'history_refresh'), btn('🏆 PnL', 'menu_pnl')],
    navRow(lang),
  ];
}

export function securityKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔑 Export key', 'wallet_export'), btn('💼 Wallet', 'menu_wallet')],
    navRow(lang),
  ];
}

export function helpKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('⚡ Manual', 'menu_manual'), btn('🤖 Auto', 'menu_auto')],
    navRow(lang),
  ];
}

export function leaderboardKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('📅 24h', 'lb_daily'), btn('📆 7d', 'lb_weekly'), btn('♾ All', 'lb_all')],
    navRow(lang),
  ];
}

export function trendingKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'trending_refresh'), btn('⚡ BUY / SELL', 'menu_manual')],
    navRow(lang),
  ];
}

export function rewardsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔗 Referral Link', 'rewards_link'), btn('💰 Claim', 'rewards_claim')],
    [btn('📋 Settings', 'rewards_settings')],
    navRow(lang),
  ];
}

export function simpleNav(lang: Language | null): InlineKeyboard {
  return [navRow(lang)];
}
