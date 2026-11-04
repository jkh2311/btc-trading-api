# btc-trading-api

Cloudflare Worker for the BTC trading project's future Binance integration.

Current state: **health-check only**. No Binance keys, account queries, order submission, or live trading.

After GitHub-to-Cloudflare deployment, test the public, non-sensitive route:

`GET /health`

Expected JSON contains `"status":"ok"` and `"liveTradingEnabled":false`.

API credentials must only be stored in Cloudflare Worker Secrets, never committed to this repository.
