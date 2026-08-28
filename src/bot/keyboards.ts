/**
 * SOL CLAW inline keyboards
 * Nav uses ← Return only (never Home).
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
    [btn('⚡ Trade', 'menu_manual'), btn('⚡ Auto-Hunter', 'hunter_menu')],
    [btn('🔥 Pump.fun', 'menu_trending'), btn('📈 Positions', 'positions_open')],
    [btn('💼 Wallet', 'menu_wallet'), btn('🏆 PnL', 'menu_pnl')],
    [btn('🎁 Rewards', 'menu_rewards'), btn('⚙️ Setup', 'menu_settings')],
  ];
}

export function navRow(
  lang: Language | null,
  backCallback?: string
): TelegramBot.InlineKeyboardButton[] {
  const target = backCallback || 'home';
  return [btn('← Return', target)];
}

export function manualEntryKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [
      btn('◎ 0.01', 'manual_size_0.01'),
      btn('◎ 0.05', 'manual_size_0.05'),
      btn('◎ 0.10', 'manual_size_0.10'),
      btn('◎ 0.25', 'manual_size_0.25'),
    ],
    navRow(lang),
  ];
}

export function tokenTradeKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🟢 Buy', 'manual_buy'), btn('🔴 Sell', 'manual_sell')],
    [
      btn('◎ 0.01', 'manual_size_0.01'),
      btn('◎ 0.05', 'manual_size_0.05'),
      btn('◎ 0.10', 'manual_size_0.10'),
      btn('◎ 0.25', 'manual_size_0.25'),
    ],
    [btn('🔄 Refresh', 'token_refresh')],
    navRow(lang, 'menu_manual'),
  ];
}

export function tokenAnalysisKeyboard(lang: Language | null): InlineKeyboard {
  return tokenTradeKeyboard(lang);
}

export function buyConfirmKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🟢 Confirm buy', 'manual_buy_confirm'), btn('Cancel', 'manual_buy_cancel')],
    navRow(lang, 'menu_manual'),
  ];
}

export function sellAmountKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [
      btn('25%', 'manual_sell_25'),
      btn('50%', 'manual_sell_50'),
      btn('75%', 'manual_sell_75'),
      btn('100%', 'manual_sell_100'),
    ],
    navRow(lang, 'menu_manual'),
  ];
}

export function sellConfirmKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔴 Confirm sell', 'manual_sell_confirm'), btn('Cancel', 'manual_sell_cancel')],
    navRow(lang, 'menu_manual'),
  ];
}

export function autoTradeKeyboard(lang: Language | null, enabled: boolean): InlineKeyboard {
  return hunterKeyboard(enabled, false);
}

export function hunterKeyboard(enabled: boolean, locked: boolean): InlineKeyboard {
  if (locked) {
    return [
      [btn('🔒 Locked (daily cap)', 'hunter_status')],
      [btn('Last 10', 'hunter_logs')],
      navRow(null),
    ];
  }
  const toggle = enabled ? '🟢 Hunting… (tap to stop)' : '⚡ Enable Auto-Hunter';
  return [
    [btn(toggle, enabled ? 'hunter_disable' : 'hunter_enable_ask')],
    [btn('Status', 'hunter_status'), btn('Last 10', 'hunter_logs')],
    [btn('🛑 Kill', 'hunter_kill')],
    navRow(null),
  ];
}

export function hunterConfirmKeyboard(): InlineKeyboard {
  return [
    [btn('✅ Arm Hunter', 'hunter_enable_confirm'), btn('Cancel', 'hunter_menu')],
  ];
}

export function autoConfigKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('Risk', 'auto_cfg_risk'), btn('TP', 'auto_cfg_tp')],
    [btn('SL', 'auto_cfg_sl'), btn('Max pos', 'auto_cfg_maxpos')],
    navRow(lang, 'menu_auto'),
  ];
}

export function walletKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'wallet_refresh'), btn('➕ Create', 'wallet_create')],
    [btn('📥 Import', 'wallet_import'), btn('💸 Withdraw', 'wallet_withdraw')],
    navRow(lang),
  ];
}

export function exportKeyWarningKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('✅ Export key', 'wallet_export_confirm')],
    [btn('← Return', 'menu_wallet')],
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
    [btn('ON', 'alerts_enable'), btn('OFF', 'alerts_disable')],
    navRow(lang),
  ];
}

export function settingsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('⚡ Auto-Hunter', 'hunter_menu')],
    [btn('🌍 Language', 'settings_language'), btn('💰 Buy size', 'settings_buysize')],
    [btn('📄 Paper mode', 'settings_paper')],
    navRow(lang),
  ];
}

export function settingsLanguageKeyboard(): InlineKeyboard {
  return languageKeyboard();
}

export function settingsBuySizeKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [
      btn('0.05', 'set_buysize_0.05'),
      btn('0.10', 'set_buysize_0.10'),
      btn('0.25', 'set_buysize_0.25'),
      btn('0.50', 'set_buysize_0.50'),
    ],
    [btn('1.00', 'set_buysize_1.00')],
    navRow(lang, 'menu_settings'),
  ];
}

export function settingsPaperKeyboard(lang: Language | null, enabled: boolean): InlineKeyboard {
  const label = enabled ? 'Turn paper OFF' : 'Turn paper ON';
  return [[btn(label, 'set_paper_toggle')], navRow(lang, 'menu_settings')];
}

export function settingsSavedKeyboard(lang: Language | null): InlineKeyboard {
  return [[btn('← Return', 'menu_settings')]];
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
    [btn('⚡ Trade', 'menu_manual'), btn('⚡ Auto-Hunter', 'hunter_menu')],
    navRow(lang),
  ];
}

export function leaderboardKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('24h', 'lb_daily'), btn('7d', 'lb_weekly'), btn('All', 'lb_all')],
    navRow(lang),
  ];
}

export function trendingKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'trending_refresh'), btn('⚡ Trade', 'menu_manual')],
    navRow(lang),
  ];
}

export function rewardsKeyboard(lang: Language | null): InlineKeyboard {
  return [
    [btn('🔗 Referral link', 'rewards_link'), btn('💰 Claim', 'rewards_claim')],
    navRow(lang),
  ];
}

export function simpleNav(lang: Language | null): InlineKeyboard {
  return [navRow(lang)];
}
