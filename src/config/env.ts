/**
 * Environment configuration for SOL CLAW.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get BOT_TOKEN() {
    return process.env.BOT_TOKEN ?? '';
  },
  get WALLET_ENCRYPTION_SECRET() {
    return process.env.WALLET_ENCRYPTION_SECRET ?? '';
  },
  get SOLANA_RPC_URL() {
    return optional(
      'SOLANA_RPC_URL',
      'https://api.mainnet-beta.solana.com'
    );
  },
  get JUPITER_QUOTE_API() {
    return optional('JUPITER_QUOTE_API', 'https://quote-api.jup.ag/v6');
  },
  get MAX_TRADE_SOL() {
    return Number(optional('MAX_TRADE_SOL', '5'));
  },
  get MAX_OPEN_POSITIONS() {
    return Number(optional('MAX_OPEN_POSITIONS', '10'));
  },
  get WEBSITE_URL() {
    return optional('WEBSITE_URL', '');
  },
  get DOCS_URL() {
    return optional('DOCS_URL', '');
  },
  get ADMIN_CHAT_IDS() {
    return optional('ADMIN_CHAT_IDS', '');
  },
  get PLATFORM_FEE_BPS() {
    return optional('PLATFORM_FEE_BPS', '100');
  },
  get PROFIT_FEE_BPS() {
    return optional('PROFIT_FEE_BPS', '100');
  },
  get REFERRAL_SHARE_BPS() {
    return optional('REFERRAL_SHARE_BPS', '6000');
  },
  get DOCUMENTATION_URL() {
    return optional('DOCUMENTATION_URL', optional('DOCS_URL', ''));
  },
  get BOT_USERNAME() {
    return optional('BOT_USERNAME', '');
  },
};

export function validateEnvForTrading(): void {
  if (!process.env.WALLET_ENCRYPTION_SECRET) {
    console.warn(
      '[config] WALLET_ENCRYPTION_SECRET not set — wallet create/import will fail until set'
    );
  }
}
