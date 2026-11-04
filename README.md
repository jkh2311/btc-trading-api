# btc-trading-api

Cloudflare Worker gateway for the BTC trading project. **Paper trading remains unchanged. There are no live trading/order routes.**

## Current endpoints

- `GET /health` — public, contains no private data.
- `GET /private/status` — protected by a strong bearer token. Returns only server status; no Binance account data.
- Every other path: 404. Every non-GET request: 405. No permissive CORS.

## Required Cloudflare Worker Secret

In Cloudflare > Workers & Pages > btc-trading-api > Settings > Variables and Secrets > Add variable:

- Type: **Secret**
- Key: `APP_AUTH_TOKEN`
- Value: a unique, randomly generated token with **at least 32 characters**. Do not reuse your Binance API key, Secret Key, or account password. Use a password manager to generate/store the token.

**Never commit this value to GitHub, share it in chat, or enter it into the public paper-trading page.** The Worker refuses private requests if this secret is missing or too short.

To test protection, visiting `/private/status` in an ordinary browser should return `401 Unauthorized` after setup, because the browser did not supply an Authorization header. Before setup it returns `503 Authentication not configured`.

A future authenticated client may send `Authorization: Bearer <your-token>`; do not hardcode the token in public GitHub Pages code. For browser access, build a secure sign-in flow and carefully restrict CORS/origins first.

## Not implemented

- Binance key/secret registration or signed account queries
- Futures trading permissions or real orders
- Browser login/session flow

Binance credentials must eventually be stored as Cloudflare **Secrets** only after account access, auth and session security have been reviewed. Do not turn on live trading at this stage.
