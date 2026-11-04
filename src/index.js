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
      if (pathname === "/private/status") {
        return json({
          authenticated: true,
          binanceConnected: false,
          liveTradingEnabled: false,
          availableActions: ["status"]
        });
      }
      return json({ error: "Not found" }, 404);
    }

    return json({ error: "Not found" }, 404);
  }
};
