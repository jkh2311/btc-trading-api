# Fixed-IP VPS preparation — read-only

Not deployed. No hosting account, server, or fixed IPv4 has been provisioned. No live order endpoints exist.

1. Provision a legitimate VPS with stable outbound IPv4 in a jurisdiction where Binance permits API use. A fixed IP alone does not guarantee Binance connectivity.
2. Secure SSH, firewall, Docker and Docker Compose. Test Binance public time API before uploading any credentials.
3. Point a domain/subdomain A record to VPS IPv4. Replace `api.example.com` in Caddyfile with that hostname.
4. Copy `.env.example` to `.env` on VPS only. Enter a new strong `APP_AUTH_TOKEN` and a **READ-ONLY** Binance API key+secret. `chmod 600 .env`. Never commit, chat, or paste the keys in GitHub Pages.
5. Run `docker compose up -d --build`. Caddy handles HTTPS with valid DNS and inbound 80/443.
6. Check `GET /health` (public). `GET /api/network` and `/api/account` require Authorization: Bearer token. Account returns USDT balance and BTCUSDT positions only.

IMPORTANT: Existing GitHub Pages app stays paper-only and is not connected to VPS; never enable Binance Futures or Withdrawals permissions yet. A production live-trading system requires much more authentication, IP allowlisting, server hardening, limits and user confirmation. If credentials were entered into the public app, rotate them before real trading. All Binance requests here are GET only.
