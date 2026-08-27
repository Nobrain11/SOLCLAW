/**
 * All InlineKeyboardMarkup builders. Two-column layout.
 */

import type TelegramBot from 'node-telegram-bot-api';

type InlineKeyboard = TelegramBot.InlineKeyboardButton[][];

function btn(text: string, callback_data: string): TelegramBot.InlineKeyboardButton {
  return { text, callback_data };
}

export function navRow(backCallback?: string): TelegramBot.InlineKeyboardButton[] {
  const row: TelegramBot.InlineKeyboardButton[] = [];
  if (backCallback) row.push(btn('🔙 Back', backCallback));
  row.push(btn('🏠 Home', 'home'));
  return row;
}

export function homeKeyboard(): InlineKeyboard {
  return [
    [btn('🤖 Auto Trade', 'menu_auto'), btn('📊 Manual Trade', 'menu_manual')],
    [btn('💰 Wallet', 'menu_wallet'), btn('📈 Positions', 'positions_open')],
    [btn('🔔 Alerts', 'menu_alerts'), btn('⚙️ Settings', 'menu_settings')],
    [btn('🏆 PnL', 'menu_pnl'), btn('📜 History', 'menu_history')],
    [btn('🔐 Security', 'menu_security'), btn('❓ Help', 'menu_help')],
  ];
}

export function manualEntryKeyboard(): InlineKeyboard {
  return [
    [btn('💰 0.01 SOL', 'manual_size_0.01'), btn('💰 0.05 SOL', 'manual_size_0.05')],
    [btn('💰 0.10 SOL', 'manual_size_0.10'), btn('💰 0.25 SOL', 'manual_size_0.25')],
    [btn('✏️ Custom Amount', 'manual_size_custom'), btn('⚙️ Trade Settings', 'menu_settings')],
    [btn('🏠 Home', 'home')],
  ];
}

export function tokenAnalysisKeyboard(): InlineKeyboard {
  return [
    [btn('🟢 BUY', 'manual_buy'), btn('🔴 SELL', 'manual_sell')],
    [btn('💰 Change Size', 'manual_change_size'), btn('⚙️ Settings', 'menu_settings')],
    navRow('menu_manual'),
  ];
}

export function buyConfirmKeyboard(): InlineKeyboard {
  return [
    [btn('✅ Confirm Buy', 'manual_buy_confirm'), btn('❌ Cancel', 'manual_buy_cancel')],
    navRow('menu_manual'),
  ];
}

export function sellAmountKeyboard(): InlineKeyboard {
  return [
    [btn('25%', 'manual_sell_25'), btn('50%', 'manual_sell_50')],
    [btn('75%', 'manual_sell_75'), btn('100%', 'manual_sell_100')],
    [btn('✏️ Custom', 'manual_sell_custom')],
    navRow('menu_manual'),
  ];
}

export function sellConfirmKeyboard(): InlineKeyboard {
  return [
    [btn('✅ Confirm Sell', 'manual_sell_confirm'), btn('❌ Cancel', 'manual_sell_cancel')],
    navRow('menu_manual'),
  ];
}

export function autoTradeKeyboard(enabled: boolean): InlineKeyboard {
  const enableLabel = enabled ? '🔴 Disable Auto' : '🟢 Enable Auto';
  return [
    [btn('🛡 Careful', 'auto_strategy_careful'), btn('⚖️ Balanced', 'auto_strategy_balanced')],
    [btn('🚀 Bold', 'auto_strategy_bold'), btn('🧠 Custom', 'auto_strategy_custom')],
    [btn(enableLabel, 'auto_toggle'), btn('⚙️ Customize', 'auto_customize')],
    [btn('📊 Open Positions', 'positions_open'), btn('🏆 Results', 'menu_pnl')],
    navRow(),
  ];
}

export function autoConfigKeyboard(): InlineKeyboard {
  return [
    [btn('💰 Risk', 'auto_cfg_risk'), btn('🎯 TP', 'auto_cfg_tp')],
    [btn('🛑 SL', 'auto_cfg_sl'), btn('📊 Max Positions', 'auto_cfg_maxpos')],
    [btn('📉 Daily Loss', 'auto_cfg_dailyloss'), btn('🛡 Safety', 'auto_cfg_safety')],
    [btn('📈 Liquidity', 'auto_cfg_liquidity'), btn('📉 Slippage', 'auto_cfg_slippage')],
    navRow('menu_auto'),
  ];
}

export function walletKeyboard(): InlineKeyboard {
  return [
    [btn('💰 Balance', 'wallet_balance'), btn('🔄 Refresh', 'wallet_refresh')],
    [btn('➕ Create Wallet', 'wallet_create'), btn('📥 Import Wallet', 'wallet_import')],
    [btn('📤 Withdraw', 'wallet_withdraw'), btn('🔑 Export Key', 'wallet_export')],
    navRow(),
  ];
}

export function exportKeyWarningKeyboard(): InlineKeyboard {
  return [
    [btn('⚠️ I UNDERSTAND', 'wallet_export_confirm')],
    [btn('❌ Cancel', 'menu_wallet'), btn('🏠 Home', 'home')],
  ];
}

export function positionsKeyboard(): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'positions_refresh'), btn('🏆 PnL', 'menu_pnl')],
    [btn('📊 Trade', 'menu_manual'), btn('📜 History', 'menu_history')],
    [btn('🏠 Home', 'home')],
  ];
}

export function alertsKeyboard(): InlineKeyboard {
  return [
    [btn('🟢 Enable', 'alerts_enable'), btn('🔴 Disable', 'alerts_disable')],
    [btn('📈 Trade Alerts', 'alerts_trade'), btn('⚠️ Risk Alerts', 'alerts_risk')],
    [btn('🐋 Whale Alerts', 'alerts_whale'), btn('🔥 Momentum', 'alerts_momentum')],
    navRow(),
  ];
}

export function settingsKeyboard(): InlineKeyboard {
  return [
    [btn('💰 Buy Size', 'settings_buysize'), btn('📉 Slippage', 'settings_slippage')],
    [btn('🎯 Take Profit', 'settings_tp'), btn('🛑 Stop Loss', 'settings_sl')],
    [btn('🔄 DCA', 'settings_dca'), btn('🛡 Risk Management', 'settings_risk')],
    [btn('📄 Paper Trading', 'settings_paper'), btn('🔔 Alerts', 'menu_alerts')],
    navRow(),
  ];
}

export function pnlKeyboard(): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'pnl_refresh'), btn('📜 History', 'menu_history')],
    [btn('📈 Positions', 'positions_open'), btn('🏠 Home', 'home')],
  ];
}

export function historyKeyboard(): InlineKeyboard {
  return [
    [btn('🔄 Refresh', 'history_refresh'), btn('🏆 PnL', 'menu_pnl')],
    [btn('📊 Positions', 'positions_open'), btn('🏠 Home', 'home')],
  ];
}

export function securityKeyboard(): InlineKeyboard {
  return [
    [btn('🔑 Export Key', 'wallet_export'), btn('💼 Wallet', 'menu_wallet')],
    [btn('🛡 Safety', 'security_safety'), btn('⚙️ Settings', 'menu_settings')],
    navRow(),
  ];
}

export function helpKeyboard(): InlineKeyboard {
  return [
    [btn('📊 Manual Trade', 'menu_manual'), btn('🤖 Auto Trade', 'menu_auto')],
    [btn('💰 Wallet', 'menu_wallet'), btn('🔐 Security', 'menu_security')],
    [btn('🏠 Home', 'home')],
  ];
}

export function settingsBuySizeKeyboard(): InlineKeyboard {
  return [
    [btn('0.01 SOL', 'set_buysize_0.01'), btn('0.05 SOL', 'set_buysize_0.05')],
    [btn('0.10 SOL', 'set_buysize_0.10'), btn('0.25 SOL', 'set_buysize_0.25')],
    [btn('0.50 SOL', 'set_buysize_0.50'), btn('1.00 SOL', 'set_buysize_1.00')],
    [btn('✏️ Custom', 'set_buysize_custom')],
    navRow('menu_settings'),
  ];
}

export function settingsSlippageKeyboard(): InlineKeyboard {
  return [
    [btn('0.5%', 'set_slip_0.5'), btn('1%', 'set_slip_1')],
    [btn('2%', 'set_slip_2'), btn('5%', 'set_slip_5')],
    [btn('✏️ Custom', 'set_slip_custom')],
    navRow('menu_settings'),
  ];
}

export function settingsTpKeyboard(): InlineKeyboard {
  return [
    [btn('+25%', 'set_tp_25'), btn('+50%', 'set_tp_50')],
    [btn('+100%', 'set_tp_100'), btn('+200%', 'set_tp_200')],
    [btn('✏️ Custom', 'set_tp_custom')],
    navRow('menu_settings'),
  ];
}

export function settingsSlKeyboard(): InlineKeyboard {
  return [
    [btn('-10%', 'set_sl_10'), btn('-20%', 'set_sl_20')],
    [btn('-30%', 'set_sl_30'), btn('-50%', 'set_sl_50')],
    [btn('✏️ Custom', 'set_sl_custom')],
    navRow('menu_settings'),
  ];
}

export function settingsPaperKeyboard(enabled: boolean): InlineKeyboard {
  const label = enabled ? '🔴 Disable Paper' : '🟢 Enable Paper';
  return [[btn(label, 'set_paper_toggle')], navRow('menu_settings')];
}

export function settingsSavedKeyboard(): InlineKeyboard {
  return [[btn('⚙️ Settings', 'menu_settings'), btn('🏠 Home', 'home')]];
}
