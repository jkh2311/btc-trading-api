import http from "node:http";
import crypto from "node:crypto";

// Owner-controlled fixed-IP VPS only; NO trading or order execution.
const port=Number(process.env.PORT||3000);
const cfg={key:process.env.BINANCE_API_KEY||"",secret:process.env.BINANCE_API_SECRET||"",auth:process.env.APP_AUTH_TOKEN||"",origin:process.env.APP_ORIGIN||"https://jkh2311.github.io"};
function reply(res,status,data,origin){
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
  if(origin===cfg.origin){headers["Access-Control-Allow-Origin"]=cfg.origin;headers["Vary"]="Origin";}
  res.writeHead(status,headers);res.end(JSON.stringify(data));
}
function authorized(header){
  if(!cfg.auth||cfg.auth.length<32||!header.startsWith("Bearer "))return false;
  const digest=x=>crypto.createHash("sha256").update(x).digest();
  return crypto.timingSafeEqual(digest(header.slice(7)),digest(cfg.auth));
}
async function binance(path,extra={}){
  const params=new URLSearchParams({...extra,recvWindow:"5000",timestamp:String(Date.now())});
  const sig=crypto.createHmac("sha256",cfg.secret).update(params.toString()).digest("hex");
  const response=await fetch("https://fapi.binance.com"+path+"?"+params+"&signature="+sig,{
    headers:{"X-MBX-APIKEY":cfg.key},redirect:"manual",signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return {ok:false,status:response.status};
  return {ok:true,data:await response.json()};
}
async function network(){
  const r=await fetch("https://fapi.binance.com/fapi/v1/time",{redirect:"manual",signal:AbortSignal.timeout(8000)});
  return {ok:r.ok,status:r.status};
}
http.createServer(async(req,res)=>{
  const path=new URL(req.url||"/","http://localhost").pathname;
  const origin=req.headers.origin||"";
  if(req.method==="GET"&&path==="/health")return reply(res,200,{status:"ok",readOnly:true,liveTradingEnabled:false},origin);
  if(req.method==="OPTIONS"&&["/api/network","/api/account"].includes(path)){
    if(origin!==cfg.origin)return reply(res,403,{error:"Forbidden"},origin);
    res.writeHead(204,{"Access-Control-Allow-Origin":cfg.origin,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Authorization","Access-Control-Max-Age":"600","Vary":"Origin"});return res.end();
  }
  if(req.method!=="GET"||!["/api/network","/api/account"].includes(path))return reply(res,404,{error:"Not found"},origin);
  if(origin&&origin!==cfg.origin)return reply(res,403,{error:"Forbidden"},origin);
  if(!authorized(req.headers.authorization||""))return reply(res,401,{error:"Unauthorized"},origin);
  try{
    if(path==="/api/network"){const x=await network();return reply(res,200,{binanceReachable:x.ok,upstreamStatus:x.status,liveTradingEnabled:false},origin);}
    if(!cfg.key||!cfg.secret)return reply(res,503,{error:"Binance secrets missing"},origin);
    const [b,p]=await Promise.all([binance("/fapi/v3/balance"),binance("/fapi/v3/positionRisk",{symbol:"BTCUSDT"})]);
    if(!b.ok||!p.ok)return reply(res,502,{error:"Binance request rejected",upstreamStatuses:[b.status||200,p.status||200]},origin);
    const usdt=Array.isArray(b.data)?b.data.find(x=>x.asset==="USDT"):null;
    if(!usdt||!Array.isArray(p.data))return reply(res,502,{error:"Unexpected Binance response"},origin);
    return reply(res,200,{readOnly:true,liveTradingEnabled:false, balance:{asset:"USDT",walletBalance:usdt.balance,availableBalance:usdt.availableBalance,crossUnPnl:usdt.crossUnPnl},positions:p.data.filter(x=>x.symbol==="BTCUSDT").map(x=>({symbol:x.symbol,positionSide:x.positionSide,positionAmt:x.positionAmt,entryPrice:x.entryPrice,markPrice:x.markPrice,unRealizedProfit:x.unRealizedProfit,leverage:x.leverage,marginType:x.marginType,liquidationPrice:x.liquidationPrice})),retrievedAt:new Date().toISOString()},origin);
  }catch(e){return reply(res,502,{error:"Binance connectivity unavailable",reason:e?.name==="TimeoutError"?"timeout":"network_error"},origin);}
}).listen(port,"0.0.0.0");
