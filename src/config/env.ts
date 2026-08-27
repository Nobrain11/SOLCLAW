/**
 * Environment configuration.
 * Required: BOT_TOKEN, WALLET_ENCRYPTION_SECRET
 * Recommended: SOLANA_RPC_URL, ADMIN_CHAT_IDS
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
};

export function validateEnvForTrading(): void {
  if (!env.BOT_TOKEN) {
    console.warn('BOT_TOKEN missing');
  }
  if (!env.WALLET_ENCRYPTION_SECRET || env.WALLET_ENCRYPTION_SECRET.length < 16) {
    console.warn(
      'WALLET_ENCRYPTION_SECRET should be a long random secret (16+ chars)'
    );
  }
}
