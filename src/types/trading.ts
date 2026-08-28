/**
 * Core trading domain types for SOL TRADE BOT.
 */

export type TradeMode = 'LIVE' | 'PAPER';
export type TradeSide = 'BUY' | 'SELL';
export type PositionStatus = 'OPEN' | 'CLOSED';
export type TradeState =
  | 'PREPARING'
  | 'SUBMITTING'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED';

export type SafetyLevel = 'GOOD' | 'CAUTION' | 'HIGH_RISK' | 'UNKNOWN';

export type AutoStrategy = 'careful' | 'balanced' | 'bold' | 'custom';

export interface TokenAnalysis {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  price: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  safetyScore: number;
  safetyLevel: SafetyLevel;
  warnings: string[];
  tradable: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  raw?: Record<string, unknown>;
}

export interface QuoteResult {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  route?: unknown;
}

export interface TradeRequest {
  userId: number;
  chatId: number;
  mint: string;
  side: TradeSide;
  amountSol?: number;
  amountToken?: number;
  percentage?: number;
  slippageBps: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  mode: TradeMode;
}

export interface TradeResult {
  state: TradeState;
  signature?: string;
  error?: string;
  inAmount?: number;
  outAmount?: number;
  price?: number;
  mode: TradeMode;
}

export interface Position {
  id: string;
  userId: number;
  mint: string;
  symbol: string;
  entryPrice: number;
  quantity: number;
  entrySol: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  mode: TradeMode;
  status: PositionStatus;
  openedAt: number;
  closedAt?: number;
  entrySignature?: string;
}

export interface TradeRecord {
  id: string;
  userId: number;
  mint: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  valueSol: number;
  feeSol: number;
  pnlSol?: number;
  pnlPct?: number;
  positionId?: string;
  mode: TradeMode;
  signature?: string;
  timestamp: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface StrategyParams {
  riskPerTradeSol: number;
  maxPositions: number;
  minLiquidityUsd: number;
  minSafetyScore: number;
  takeProfitPct: number;
  stopLossPct: number;
  maxSlippageBps: number;
}

export interface WalletInfo {
  publicKey: string;
  balanceSol: number;
  tokenBalances: Array<{ mint: string; symbol?: string; amount: number; uiAmount: number }>;
}
