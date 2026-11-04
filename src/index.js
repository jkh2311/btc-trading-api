// BTC trading gateway (read-only preparation).
// Keep ALL credentials in Cloudflare Worker Secrets, NEVER in this repository.
// No Binance account API calls and NO live order endpoints are implemented.

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS });
}

// Compare cryptographic digests to avoid variable-length/plaintext early exits.
async function validToken(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected.length < 32) {
    return false;
  }
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}


// Read-only signed Binance USDⓈ-M futures API request.
// Never log, return, or persist API credentials or signed URLs.
async function fetchCommissionRate(env) {
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    return json({ error: "Binance API secrets not configured", code: "BINANCE_NOT_CONFIGURED" }, 503);
  }
  const params = new URLSearchParams({
    symbol: "BTCUSDT",
    recvWindow: "5000",
    timestamp: String(Date.now())
  });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.BINANCE_API_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(params.toString())
  ));
  const signature = Array.from(signatureBytes, b => b.toString(16).padStart(2, "0")).join("");
  params.set("signature", signature);
  try {
    const response = await fetch("https://fapi.binance.com/fapi/v1/commissionRate?" + params.toString(), {
      method: "GET",
      headers: { "X-MBX-APIKEY": env.BINANCE_API_KEY },
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    // Do not reflect arbitrary upstream messages or headers to callers.
    if (!response.ok) {
      return json({ error: "Binance commission lookup failed", code: "BINANCE_LOOKUP_FAILED", upstreamStatus: response.status }, 502);
    }
    const data = await response.json();
    const maker = Number(data.makerCommissionRate);
    const taker = Number(data.takerCommissionRate);
    if (data.symbol !== "BTCUSDT" || !Number.isFinite(maker) || !Number.isFinite(taker) || maker < 0 || taker < 0 || maker > 1 || taker > 1) {
      return json({ error: "Unexpected Binance response", code: "BINANCE_BAD_RESPONSE" }, 502);
    }
    return json({
      symbol: "BTCUSDT",
      market: "USD-M Futures",
      makerCommissionRate: maker,
      takerCommissionRate: taker,
      makerPercent: Number((maker * 100).toFixed(6)),
      takerPercent: Number((taker * 100).toFixed(6)),
      liveTradingEnabled: false,
      retrievedAt: new Date().toISOString()
    });
  } catch (_) {
    return json({ error: "Binance commission lookup unavailable", code: "BINANCE_UNAVAILABLE" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    // Public health check contains no account information or credentials.
    if (pathname === "/health") {
      return json({
        status: "ok",
        service: "btc-trading-api",
        authentication: "required-for-private-routes",
        binanceConnected: false,
        liveTradingEnabled: false
      });
    }

    // Any future account endpoint must be placed AFTER authentication.
    if (pathname.startsWith("/private/")) {
      if (!env.APP_AUTH_TOKEN || env.APP_AUTH_TOKEN.length < 32) {
        return json({ error: "Authentication not configured" }, 503);
      }
      const authorization = request.headers.get("Authorization") || "";
      const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(authorization);
      if (!match || !(await validToken(match[1], env.APP_AUTH_TOKEN))) {
        return json({ error: "Unauthorized" }, 401);
      }
      if (pathname === "/private/commission-rate") {
        return fetchCommissionRate(env);
      }
      if (pathname === "/private/status") {
        return json({
          authenticated: true,
          binanceConnected: false,
          liveTradingEnabled: false,
          availableActions: ["status", "commission-rate"]
        });
      }
      return json({ error: "Not found" }, 404);
    }

    return json({ error: "Not found" }, 404);
  }
};
