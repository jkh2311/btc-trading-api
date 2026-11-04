// Binance connection gateway — SAFE STARTER, no exchange credentials or orders.
// The only active endpoint is a public, non-sensitive health check.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    };
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        service: "btc-trading-api",
        binanceConnected: false,
        liveTradingEnabled: false
      }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  }
};
