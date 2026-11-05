# btc-trading-api

Cloudflare Worker gateway for the BTC trading project. **Paper trading remains unchanged. There are no live trading/order routes.**

## Current endpoints

- `GET /health` — public, contains no private data.
- `GET /private/status` — protected by a strong bearer token. Returns only server status; no Binance account data.
- `GET /private/commission-rate` — authenticated **read-only** BTCUSDT USD-M futures maker/taker commission rate query. Requires `BINANCE_API_KEY` and `BINANCE_API_SECRET` Cloudflare Secrets. Never submits orders.
- Every other path: 404. Every non-GET request: 405. No permissive CORS.

## Required Cloudflare Worker Secret

In Cloudflare > Workers & Pages > btc-trading-api > Settings > Variables and Secrets > Add variable:

- Type: **Secret**
- Key: `APP_AUTH_TOKEN`
- Value: a unique, randomly generated token with **at least 32 characters**. Do not reuse your Binance API key, Secret Key, or account password. Use a password manager to generate/store the token.

**Never commit this value to GitHub, share it in chat, or enter it into the public paper-trading page.** The Worker refuses private requests if this secret is missing or too short.

To test protection, visiting `/private/status` in an ordinary browser should return `401 Unauthorized` after setup, because the browser did not supply an Authorization header. Before setup it returns `503 Authentication not configured`.

A future authenticated client may send `Authorization: Bearer <your-token>`; do not hardcode the token in public GitHub Pages code. For browser access, build a secure sign-in flow and carefully restrict CORS/origins first.

## Cloudflare secret setup (after authentication is configured)

Add each as **Secret**, not Text, under Settings > Runtime variables and secrets (Production):

- `BINANCE_API_KEY` — Binance key, NOT the secret key
- `BINANCE_API_SECRET` — Binance secret key; keep private

Never paste credentials into ChatGPT, README, GitHub, or public frontend code. `APP_AUTH_TOKEN` is distinct from Binance credentials. Binance API permissions for lookup can remain **Reading only** while developing; no futures trading permission is required for this lookup. Some Binance API configurations restrict IP allowlists; Cloudflare Workers egress IPs may vary. If the call fails, do not disable security protections to force a connection.

The private endpoint accepts a Bearer token **in the HTTP Authorization header**. Do not put tokens in URLs or browser query strings. The GitHub Pages app has not been connected to this authentication method yet.

## Not implemented

- Binance account balances, positions, or trading history queries
- Futures trading permissions or real orders
- Browser login/session flow

Binance credentials must eventually be stored as Cloudflare **Secrets** only after account access, auth and session security have been reviewed. Do not turn on live trading at this stage.

## 실전 전환 개발 브랜치: 읽기 전용 계좌 스냅샷 (배포 전)

`feature/read-only-live-account-snapshot` 브랜치에 보호된 `GET /private/live-snapshot`을 추가했습니다. 기존 `APP_AUTH_TOKEN` Bearer 인증, Cloudflare Secrets `BINANCE_API_KEY` / `BINANCE_API_SECRET`을 사용하여 BTCUSDT USDⓈ-M 선물의 **USDT 잔고, 포지션, 현재 미체결 주문**을 읽어 옵니다. 응답은 필요한 필드만 반환하며 API 키와 서명은 반환하지 않습니다.

- 다른 경로의 인증과 권한 검증을 우회하지 않습니다.
- GET 전용이며 실전 주문 생성/수정/취소 API는 여전히 없습니다.
- 기본 브랜치와 배포에는 아직 적용하지 않았습니다.
- API 거래 권한을 켜거나 비밀값을 채팅/GitHub에 전달하지 마세요.
- Cloudflare 배포 전 읽기 전용 호출, CORS, 인증, 계좌 응답 구조를 검증해야 합니다.
