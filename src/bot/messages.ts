/**
 * Static / template message text for SOL TRADE BOT.
 */

export const BOT_NAME = '🐱 SOL TRADE BOT';

export function homeMessage(state: {
  openPositions: number;
  realizedPnl: number;
  autoTrade: boolean;
  alerts: boolean;
  paper: boolean;
  buySize: number;
  takeProfit: number;
  stopLoss: number;
  walletConnected: boolean;
}): string {
  const pnlSign = state.realizedPnl >= 0 ? '+' : '';
  const auto = state.autoTrade ? '🟢 ON' : '⚪ OFF';
  const alerts = state.alerts ? '🟢 ON' : '⚪ OFF';
  const paper = state.paper ? '🟢 ON' : '⚪ OFF';
  const wallet = state.walletConnected ? 'Connected' : 'Not connected';

  return (
    `🏠 <b>Trade Bot — Home</b>\n\n` +
    `💼 Open: <b>${state.openPositions}</b> · 🏆 Realized: <b>${pnlSign}${state.realizedPnl.toFixed(2)} SOL</b>\n\n` +
    `⚙️ <b>Your setup</b>\n\n` +
    `🤖 Auto-trade: ${auto}\n` +
    `🔔 Alerts: ${alerts}\n` +
    `📄 Paper: ${paper}\n\n` +
    `💰 Buy size: <b>${state.buySize} SOL</b>\n` +
    `🎯 TP: <b>+${state.takeProfit}%</b> · 🛑 SL: <b>${state.stopLoss}%</b>\n\n` +
    `🔐 Wallet: <b>${wallet}</b>\n\n` +
    `Choose what you want to do:`
  );
}

export const MANUAL_ENTRY =
  `⚡ <b>MANUAL TRADE</b>\n\n` +
  `Paste a Solana token address below.\n\n` +
  `The bot will check:\n` +
  `✓ Token validity\n` +
  `✓ Liquidity\n` +
  `✓ Trading status\n` +
  `✓ Risk signals\n` +
  `✓ Market data\n\n` +
  `Then choose your trade size.`;

export function tokenAnalysisMessage(data: {
  name: string;
  price: string;
  marketCap: string;
  liquidity: string;
  safety: string;
  change24h: string;
}): string {
  return (
    `🐱 <b>${data.name}</b>\n\n` +
    `💵 Price: $${data.price}\n` +
    `💎 MC: $${data.marketCap}\n` +
    `💧 Liquidity: $${data.liquidity}\n\n` +
    `🛡 Safety: ${data.safety}\n` +
    `📊 24h: ${data.change24h}\n\n` +
    `Choose action:`
  );
}

export function buyConfirmMessage(data: {
  token: string;
  amount: number;
  slippage: number;
  takeProfit: number;
  stopLoss: number;
}): string {
  return (
    `🟢 <b>BUY CONFIRMATION</b>\n\n` +
    `🐱 ${data.token}\n\n` +
    `💰 Amount: ${data.amount} SOL\n` +
    `📉 Slippage: ${data.slippage.toFixed(2)}%\n` +
    `🎯 Take Profit: +${data.takeProfit}%\n` +
    `🛑 Stop Loss: ${data.stopLoss}%\n\n` +
    `Proceed?`
  );
}

export function sellConfirmMessage(data: {
  token: string;
  positionSol: number;
}): string {
  return (
    `🔴 <b>SELL CONFIRMATION</b>\n\n` +
    `🐱 ${data.token}\n\n` +
    `Position: ${data.positionSol} SOL\n\n` +
    `Choose amount:`
  );
}

export function autoTradeMessage(enabled: boolean): string {
  const status = enabled ? '🟢 ON' : '🔴 OFF';
  return (
    `🤖 <b>AUTO TRADE</b>\n\n` +
    `Automated trading is currently:\n\n` +
    `${status}\n\n` +
    `Choose your strategy:`
  );
}

export const WALLET_PLACEHOLDER =
  `💼 <b>WALLET</b>\n\n` +
  `Address:\n` +
  `<code>—</code>\n\n` +
  `Balance:\n` +
  `◎ 0.0000 SOL\n\n` +
  `Status:\n` +
  `🔐 Not connected`;

export function walletMessage(data: {
  address: string;
  balance: number;
  connected: boolean;
}): string {
  const status = data.connected ? '🔐 Connected' : '🔓 Not connected';
  return (
    `💼 <b>WALLET</b>\n\n` +
    `Address:\n` +
    `<code>${data.address || '—'}</code>\n\n` +
    `Balance:\n` +
    `◎ ${data.balance.toFixed(4)} SOL\n\n` +
    `Status:\n` +
    `${status}`
  );
}

export const EXPORT_KEY_WARNING =
  `🔐 <b>EXPORT PRIVATE KEY</b>\n\n` +
  `⚠️ Security confirmation required.\n\n` +
  `Exporting your private key gives complete control of the wallet.\n\n` +
  `Do you understand the risk?`;

export const POSITIONS_EMPTY =
  `📈 <b>OPEN POSITIONS</b>\n\n` + `📭 No open positions.`;

export function positionsHeader(): string {
  return `📈 <b>OPEN POSITIONS</b>\n`;
}

export const ALERTS_SCREEN =
  `🔔 <b>ALERTS</b>\n\n` +
  `Alert categories:\n\n` +
  `📈 Trade alerts\n` +
  `🎯 Take profit\n` +
  `🛑 Stop loss\n` +
  `🐋 Whale alerts\n` +
  `🔥 Momentum alerts\n` +
  `⚠️ Risk alerts`;

export function pnlMessage(data: {
  openPnl: number;
  realizedPnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}): string {
  const openSign = data.openPnl >= 0 ? '+' : '';
  const realSign = data.realizedPnl >= 0 ? '+' : '';
  return (
    `🏆 <b>PnL</b>\n\n` +
    `Open PnL:\n` +
    `${openSign}${data.openPnl.toFixed(2)} SOL\n\n` +
    `Realized PnL:\n` +
    `${realSign}${data.realizedPnl.toFixed(2)} SOL\n\n` +
    `Trades: ${data.trades}\n` +
    `Wins: ${data.wins}\n` +
    `Losses: ${data.losses}\n` +
    `Win Rate: ${data.winRate.toFixed(0)}%`
  );
}

export const HISTORY_EMPTY =
  `📜 <b>TRADE HISTORY</b>\n\n` + `No completed trades yet.`;

export const SECURITY_SCREEN =
  `🔐 <b>SECURITY</b>\n\n` +
  `Wallet protection\n` +
  `Private-key encryption\n` +
  `Export protection\n` +
  `Transaction confirmation`;

export const HELP_SCREEN =
  `❓ <b>HELP</b>\n\n` +
  `📊 <b>Manual Trade</b> — Paste a token address, analyze, then buy/sell with confirmation.\n\n` +
  `🤖 <b>Auto Trade</b> — Choose a strategy and let the bot trade within your risk limits.\n\n` +
  `💰 <b>Wallet</b> — Create, import, check balance, withdraw, or export key.\n\n` +
  `Focus: <b>pump.fun</b> meme tokens on Solana.`;

export const SETTINGS_SCREEN =
  `⚙️ <b>SETTINGS</b>\n\n` + `Configure defaults and risk controls.`;

export function settingsBuySizeMessage(current: number): string {
  return (
    `💰 <b>BUY SIZE</b>\n\n` +
    `Current default: <b>${current} SOL</b>\n\n` +
    `Select a new default buy size:`
  );
}

export function settingsSlippageMessage(current: number): string {
  return (
    `📉 <b>SLIPPAGE</b>\n\n` +
    `Current: <b>${current}%</b>\n\n` +
    `Select max slippage:`
  );
}

export function settingsTpMessage(current: number): string {
  return (
    `🎯 <b>TAKE PROFIT</b>\n\n` +
    `Current: <b>+${current}%</b>\n\n` +
    `Select default take-profit:`
  );
}

export function settingsSlMessage(current: number): string {
  return (
    `🛑 <b>STOP LOSS</b>\n\n` +
    `Current: <b>${current}%</b>\n\n` +
    `Select default stop-loss:`
  );
}

export function settingsPaperMessage(enabled: boolean): string {
  const status = enabled ? '🟢 ON' : '⚪ OFF';
  return (
    `📄 <b>PAPER TRADING</b>\n\n` +
    `Status: ${status}\n\n` +
    `Paper mode simulates trades without spending real SOL.`
  );
}

export function valueSavedMessage(label: string, value: string): string {
  return `✅ <b>${label}</b> updated to <b>${value}</b>`;
}
