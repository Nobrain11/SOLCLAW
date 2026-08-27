# SOLCLAW (SOL TRADE BOT)

Professional Solana trading assistant for Telegram.

## Features

- Manual Trade — paste mint, scan, safety, confirm buy/sell
- Paper Trading — real market prices, no on-chain risk
- Live Trading — Jupiter swaps with confirmation
- Wallet — create, import, balance, withdraw, encrypted key export
- Positions, PnL, History — LIVE and PAPER separated
- TP/SL monitor — background exits with Telegram alerts
- Risk engine — balance, size, safety, max positions

## Setup

```bash
cp .env.example .env
# fill BOT_TOKEN and WALLET_ENCRYPTION_SECRET
npm install
npm run dev
```

## Environment

```
BOT_TOKEN=
WALLET_ENCRYPTION_SECRET=
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
JUPITER_QUOTE_API=https://quote-api.jup.ag/v6
MAX_TRADE_SOL=5
MAX_OPEN_POSITIONS=10
```

## Scripts

- npm run dev
- npm run build
- npm start

## Safety

- Private keys encrypted (AES-256-GCM)
- Never logged or stored in callback_data
- No trade without explicit confirmation
- No success without on-chain confirmation
