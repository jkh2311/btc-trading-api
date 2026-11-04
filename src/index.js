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


// Only the known public paper app can call the credential-in-memory route.
// Token MUST accompany every request; no tokens/keys stored or logged.
const APP_ORIGIN = "https://jkh2311.github.io";
function corsHeaders(origin) {
  return origin === APP_ORIGIN ? {
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  } : {};
}
function corsJson(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {status, headers:{...RESPONSE_HEADERS,...extra}});
}

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
async function fetchCommissionRate(env, oneTimeCredentials = null, extraHeaders = {}) {
  const apiKey = oneTimeCredentials ? oneTimeCredentials.apiKey : env.BINANCE_API_KEY;
  const apiSecret = oneTimeCredentials ? oneTimeCredentials.apiSecret : env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return corsJson({ error: "Binance API secrets not configured", code: "BINANCE_NOT_CONFIGURED" }, 503, extraHeaders);
  }
  const params = new URLSearchParams({
    symbol: "BTCUSDT",
    recvWindow: "5000",
    timestamp: String(Date.now())
  });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(apiSecret),
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
      headers: { "X-MBX-APIKEY": apiKey },
      redirect: "manual",
      signal: AbortSignal.timeout(8000)
    });
    // Do not reflect arbitrary upstream messages or headers to callers.
    if (!response.ok) {
      return corsJson({ error: "Binance commission lookup failed", code: "BINANCE_LOOKUP_FAILED", upstreamStatus: response.status }, 502, extraHeaders);
    }
    const data = await response.json();
    const maker = Number(data.makerCommissionRate);
    const taker = Number(data.takerCommissionRate);
    if (data.symbol !== "BTCUSDT" || !Number.isFinite(maker) || !Number.isFinite(taker) || maker < 0 || taker < 0 || maker > 1 || taker > 1) {
      return corsJson({ error: "Unexpected Binance response", code: "BINANCE_BAD_RESPONSE" }, 502, extraHeaders);
    }
    return corsJson({
      symbol: "BTCUSDT",
      market: "USD-M Futures",
      makerCommissionRate: maker,
      takerCommissionRate: taker,
      makerPercent: Number((maker * 100).toFixed(6)),
      takerPercent: Number((taker * 100).toFixed(6)),
      liveTradingEnabled: false,
      retrievedAt: new Date().toISOString()
    }, 200, extraHeaders);
  } catch (_) {
    return corsJson({ error: "Binance commission lookup unavailable", code: "BINANCE_UNAVAILABLE" }, 502, extraHeaders);
  }
}


// Authenticated public Binance futures connectivity probe. Sends no credentials.
async function diagnoseBinance() {
  const probes = [
    ["binanceFutures", "https://fapi.binance.com/fapi/v1/time"],
    ["cloudflareInternet", "https://www.cloudflare.com/cdn-cgi/trace"]
  ];
  const checks = await Promise.all(probes.map(async ([name, url]) => {
    try {
      const response = await fetch(url, {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(6000)
      });
      return { name, result: response.ok ? "reachable" : "http_error", httpStatus: response.status };
    } catch (err) {
      const allowed = ["TimeoutError", "AbortError", "TypeError"];
      return { name, result: "network_error", errorType: allowed.includes(err?.name) ? err.name : "OtherError" };
    }
  }));
  return json({ code: "NETWORK_PROBE", checks });
}

function connectPage(){
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,"0")).join("");
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>바이낸스 수수료 연결 테스트</title><style nonce="${nonce}">body{margin:0;background:#0b1728;color:white;font:16px -apple-system,sans-serif;padding:20px}main{max-width:480px;margin:auto;background:#192b45;border-radius:14px;padding:18px}p{color:#c5d5e8;line-height:1.6}label{display:block;margin:18px 0 7px}input{box-sizing:border-box;width:100%;padding:13px;background:#091625;color:white;border:1px solid #89a2c2;border-radius:9px;font-size:16px}button{margin-top:12px;width:100%;padding:13px;background:#2569bb;color:white;border:0;border-radius:9px;font-size:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#091625;border-radius:9px;padding:14px}.note{font-size:12px}</style></head><body><main><h3>바이낸스 수수료 연결 테스트</h3><p>BTCUSDT 선물 수수료 조회만 실행해요. 실제 주문은 실행하지 않아요.</p><label for="token">APP_AUTH_TOKEN</label><input id="token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Cloudflare에 등록한 인증 토큰"><button id="run">수수료율 조회하기</button><pre id="result" aria-live="polite">아직 조회하지 않았어요.</pre><p class="note">바이낸스 API Key나 Secret Key는 여기에 넣지 마세요. 토큰도 URL·GitHub·채팅에 올리지 마세요. 이 페이지는 토큰을 저장하지 않아요.</p></main><script nonce="${nonce}" src="/connect-script"></script></body></html>`;
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; script-src 'nonce-"+nonce+"' 'self'; style-src 'nonce-"+nonce+"'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}
const connectScript=`async function explainFailure(r,d,token){let out='조회 실패: HTTP '+r.status+(d.code?' / '+d.code:'');if(r.status===502){try{const check=await fetch('/private/network-check',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});const x=await check.json();out+='\\\\n네트워크 진단: '+x.code+(x.checks?'\\\\n'+x.checks.map(c=>c.name+': '+c.result+(c.httpStatus?' HTTP '+c.httpStatus:'')+(c.errorType?' ('+c.errorType+')':'')).join('\\\\n'):'')}catch(_){out+='\\\\n네트워크 진단 불가'}}return out}document.getElementById('run').onclick=async function(){const b=this,i=document.getElementById('token'),o=document.getElementById('result'),token=i.value.trim();if(!token){o.textContent='인증 토큰을 입력해 주세요.';return}b.disabled=true;o.textContent='조회 중…';try{const r=await fetch('/private/commission-rate',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});const d=await r.json();o.textContent=r.ok?'✅ 조회 성공!\\n지정가 메이커: '+d.makerPercent+'%\\n시장가 테이커: '+d.takerPercent+'%\\n실거래: 비활성화':await explainFailure(r,d,token)}catch(e){o.textContent='연결 실패. 네트워크를 확인해 주세요.'}finally{i.value='';b.disabled=false}};`;
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (pathname === "/private/commission-with-keys" && request.method === "OPTIONS") {
      if (origin !== APP_ORIGIN) return json({error:"Forbidden"},403);
      return new Response(null,{status:204,headers:corsHeaders(origin)});
    }
    if (pathname === "/private/commission-with-keys" && request.method === "POST") {
      const h = corsHeaders(origin);
      if (origin !== APP_ORIGIN) return json({error:"Forbidden"},403);
      if (!env.APP_AUTH_TOKEN || env.APP_AUTH_TOKEN.length < 32) return corsJson({error:"Authentication not configured"},503,h);
      const auth = request.headers.get("Authorization") || "";
      const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(auth);
      if (!match || !(await validToken(match[1],env.APP_AUTH_TOKEN))) return corsJson({error:"Unauthorized"},401,h);
      if (!(request.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json")) return corsJson({error:"Unsupported media type"},415,h);
      if (Number(request.headers.get("Content-Length")||0)>4096) return corsJson({error:"Request too large"},413,h);
      let input;
      try { input=await request.json(); } catch (_) { return corsJson({error:"Invalid JSON"},400,h); }
      const apiKey=input?.apiKey,apiSecret=input?.apiSecret;
      if(typeof apiKey!=="string"||typeof apiSecret!=="string"||apiKey.length<10||apiKey.length>256||apiSecret.length<10||apiSecret.length>256) return corsJson({error:"Invalid API key fields"},400,h);
      return fetchCommissionRate(env,{apiKey,apiSecret},h);
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (pathname === "/connect") return connectPage();
    if (pathname === "/connect-script") return new Response(connectScript,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
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
      if (pathname === "/private/network-check") return diagnoseBinance();
      if (pathname === "/private/commission-rate") {
        return fetchCommissionRate(env);
      }
      if (pathname === "/private/status") {
        return json({
          authenticated: true,
          binanceConnected: false,
          liveTradingEnabled: false,
          availableActions: ["status", "commission-rate", "network-check"]
        });
      }
      return json({ error: "Not found" }, 404);
    }

    return json({ error: "Not found" }, 404);
  }
};
