/**
 * Environment validation. Fail fast if critical secrets are missing.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

export const env = {
  get BOT_TOKEN() {
    return optional('BOT_TOKEN', '');
  },
  get SOLANA_RPC_URL() {
    return optional('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
  },
  get WALLET_ENCRYPTION_SECRET() {
    const v =
      process.env.WALLET_ENCRYPTION_SECRET ||
      process.env.ENCRYPTION_SECRET ||
      '';
    if (!v || v.length < 16) {
      throw new Error(
        'Set WALLET_ENCRYPTION_SECRET in Railway (min 16 chars, e.g. openssl rand -hex 32)'
      );
    }
    return v;
  },
  get JUPITER_QUOTE_API() {
    return optional('JUPITER_QUOTE_API', 'https://quote-api.jup.ag/v6');
  },
  get DEXSCREENER_API() {
    return optional('DEXSCREENER_API', 'https://api.dexscreener.com/latest/dex');
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
  get HELIUS_API_KEY() {
    return optional('HELIUS_API_KEY', '');
  },
  get JITO_ENABLED() {
    return optional('JITO_ENABLED', '1');
  },
  get JITO_TIP_SOL() {
    return optional('JITO_TIP_SOL', '0.0001');
  },
  get X_BEARER_TOKEN() {
    return optional('X_BEARER_TOKEN', '');
  },
};

export function validateEnvForTrading(): void {
  const sec =
    process.env.WALLET_ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET || '';
  if (!sec || sec.length < 16) {
    console.warn(
      '[config] Set WALLET_ENCRYPTION_SECRET (min 16 chars) — wallet create/import will fail until set'
    );
  }
}
