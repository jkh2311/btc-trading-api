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


// Authenticated public Binance futures connectivity probe. Sends no credentials.
async function diagnoseBinance() {
  try {
    const response = await fetch("https://fapi.binance.com/fapi/v1/time", {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return json({ code: "BINANCE_PUBLIC_HTTP_ERROR", upstreamStatus: response.status });
    const data = await response.json();
    return json({ code: "BINANCE_PUBLIC_REACHABLE", clockOffsetMs: typeof data.serverTime === "number" ? Math.round(data.serverTime - Date.now()) : null });
  } catch (err) {
    return json({ code: err && err.name === "TimeoutError" ? "BINANCE_PUBLIC_TIMEOUT" : "BINANCE_PUBLIC_NETWORK_ERROR" });
  }
}

function connectPage(){
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,"0")).join("");
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>바이낸스 수수료 연결 테스트</title><style nonce="${nonce}">body{margin:0;background:#0b1728;color:white;font:16px -apple-system,sans-serif;padding:20px}main{max-width:480px;margin:auto;background:#192b45;border-radius:14px;padding:18px}p{color:#c5d5e8;line-height:1.6}label{display:block;margin:18px 0 7px}input{box-sizing:border-box;width:100%;padding:13px;background:#091625;color:white;border:1px solid #89a2c2;border-radius:9px;font-size:16px}button{margin-top:12px;width:100%;padding:13px;background:#2569bb;color:white;border:0;border-radius:9px;font-size:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#091625;border-radius:9px;padding:14px}.note{font-size:12px}</style></head><body><main><h3>바이낸스 수수료 연결 테스트</h3><p>BTCUSDT 선물 수수료 조회만 실행해요. 실제 주문은 실행하지 않아요.</p><label for="token">APP_AUTH_TOKEN</label><input id="token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Cloudflare에 등록한 인증 토큰"><button id="run">수수료율 조회하기</button><pre id="result" aria-live="polite">아직 조회하지 않았어요.</pre><p class="note">바이낸스 API Key나 Secret Key는 여기에 넣지 마세요. 토큰도 URL·GitHub·채팅에 올리지 마세요. 이 페이지는 토큰을 저장하지 않아요.</p></main><script nonce="${nonce}" src="/connect-script"></script></body></html>`;
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; script-src 'nonce-"+nonce+"' 'self'; style-src 'nonce-"+nonce+"'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}
const connectScript=`async function explainFailure(r,d,token){let out='조회 실패: HTTP '+r.status+(d.code?' / '+d.code:'');if(r.status===502){try{const check=await fetch('/private/network-check',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});const x=await check.json();out+='\\\\n네트워크 진단: '+x.code+(x.upstreamStatus?' ('+x.upstreamStatus+')':'')+(typeof x.clockOffsetMs==='number'?' / 시간차 '+x.clockOffsetMs+'ms':'')}catch(_){out+='\\\\n네트워크 진단 불가'}}return out}document.getElementById('run').onclick=async function(){const b=this,i=document.getElementById('token'),o=document.getElementById('result'),token=i.value.trim();if(!token){o.textContent='인증 토큰을 입력해 주세요.';return}b.disabled=true;o.textContent='조회 중…';try{const r=await fetch('/private/commission-rate',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});const d=await r.json();o.textContent=r.ok?'✅ 조회 성공!\\n지정가 메이커: '+d.makerPercent+'%\\n시장가 테이커: '+d.takerPercent+'%\\n실거래: 비활성화':await explainFailure(r,d,token)}catch(e){o.textContent='연결 실패. 네트워크를 확인해 주세요.'}finally{i.value='';b.disabled=false}};`;
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
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
