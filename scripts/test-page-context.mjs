import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module,{createRequire} from "node:module";
import {performance} from "node:perf_hooks";
import ts from "typescript";
import {NextRequest} from "next/server.js";
const require=createRequire(import.meta.url);
const oldSecret=process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY="local-test-signing-key";
process.env.NEXT_PUBLIC_SUPABASE_URL="https://test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="local-anon";
let activeHeaders=new Headers(),calls=0,delay=0,refresh=false;
let profile={user_id:"alice",login_id:"alice",name:"Alice",nickname:null,role:"member",account_status:"active",approval_status:"approved",staff_position:null,profile_image_url:null,is_pacer:false};
let withdrawal=null,config={status:"normal"};
const pause=()=>new Promise(resolve=>setTimeout(resolve,delay));
const client={auth:{getUser:async()=>{calls++;await pause();return {data:{user:{id:profile.user_id}}};}},from(table){const query={select(){return query;},eq(){return query;},async maybeSingle(){calls++;await pause();return {data:table==="profiles"?{...profile}:table==="withdrawal_requests"?withdrawal:{setting_value:config},error:null};}};return query;}};
const cache=new Map();
function compile(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const compiled=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const compiledModule=new Module(file);cache.set(file,compiledModule.exports);
 compiledModule.require=id=>{
  if(id==="next/headers")return {headers:async()=>activeHeaders};
  if(id==="react")return {cache:fn=>fn};
  if(id==="@supabase/ssr")return {createServerClient:(_url,_key,options)=>({...client,auth:{getUser:async()=>{if(refresh)options.cookies.setAll([{name:"session",value:"renewed",options:{path:"/",httpOnly:true}}]);return client.auth.getUser();}}})};
  if(id==="@/lib/supabase/server")return {createSupabaseServerClient:async()=>client};
  if(id==="@/lib/supabase/admin")return {createSupabaseAdminClient:()=>client};
  if(id.startsWith("@/"))return compile(path.join("src",id.slice(2))+".ts");
  if(id.startsWith("."))return compile(path.resolve(path.dirname(file),id)+".ts");
  return require(id);
 };
 compiledModule._compile(compiled,file);cache.set(file,compiledModule.exports);return compiledModule.exports;
}
const context=compile("src/lib/auth/page-context.ts"),auth=compile("src/lib/auth/current-user.ts"),{proxy}=compile("src/proxy.ts");
const verified={...profile,withdrawal_pending:false,service_blocked:{}};
const token=context.encodePageContext(verified,"session=alice","/schedules",1000);
assert.equal(context.decodePageContext(token,"session=alice",1001).user_id,"alice");
for(const [value,cookie,time] of [[token,"session=bob",1001],[token,"session=alice",61001],[token,"session=alice",999],["forged","session=alice",1001]])assert.equal(context.decodePageContext(value,cookie,time),null);
const [payload,mac]=token.split(".");const changed=JSON.parse(Buffer.from(payload,"base64url"));changed.profile.role="admin";
assert.equal(context.decodePageContext(Buffer.from(JSON.stringify(changed)).toString("base64url")+"."+mac,"session=alice",1001),null);
assert.equal(context.canPassPageContext("/api/schedules","GET"),false);
assert.equal(context.canPassPageContext("/schedules","POST"),false);
async function run(pathname="/schedules",reuse=true,injected="forged"){
 const response=await proxy(new NextRequest("https://local.invalid"+pathname,{headers:{cookie:"session=alice",[context.PAGE_CONTEXT_HEADER]:injected}}));
 assert.equal(response.headers.has(context.PAGE_CONTEXT_HEADER),false);
 activeHeaders=new Headers();
 for(const key of (response.headers.get("x-middleware-override-headers")??"").split(",").filter(Boolean)){
  const value=response.headers.get("x-middleware-request-"+key);if(value!==null)activeHeaders.set(key,value);
 }
 if(!reuse)activeHeaders.delete(context.PAGE_CONTEXT_HEADER);
 return response;
}
try{
 calls=0;await run();assert.equal(calls,4);assert.equal((await auth.getCurrentPageProfile()).user_id,"alice");assert.equal(calls,4);
 // Client-supplied signed data is also discarded rather than trusted by proxy.
 const forged=context.encodePageContext({...verified,user_id:"bob",role:"admin"},"session=alice","/schedules");
 calls=0;await run("/schedules",true,forged);assert.equal((await auth.getCurrentPageProfile()).user_id,"alice");assert.equal(calls,4);
 calls=0;await run("/api/auth/service-status");assert.equal(calls,0);assert.equal(activeHeaders.has(context.PAGE_CONTEXT_HEADER),false);
 const statusRoute=compile("src/app/api/auth/service-status/route.ts");
 assert.equal((await statusRoute.GET()).status,200);assert.equal(calls,4);
 profile={...profile,account_status:"suspended"};assert.equal((await (await statusRoute.GET()).json()).destination,"/account-status");profile={...profile,account_status:"active"};
 calls=0;await run("/api/schedules");assert.equal(activeHeaders.has(context.PAGE_CONTEXT_HEADER),false);await auth.getCurrentPageProfile();assert.equal(calls,8);
 calls=0;await run();await auth.getCurrentProfile();assert.equal(calls,8);
 calls=0;activeHeaders=new Headers({cookie:"session=alice",[context.PAGE_CONTEXT_HEADER]:"bad"});await auth.getCurrentPageProfile();assert.equal(calls,4);
 refresh=true;calls=0;const refreshed=await run();assert.equal(refreshed.cookies.get("session")?.value,"renewed");assert.equal(activeHeaders.get("cookie"),"session=renewed");assert.equal((await auth.getCurrentPageProfile()).user_id,"alice");assert.equal(calls,4);refresh=false;
 // State changes are checked by the NEXT request, without a shared cache.
 profile={...profile,account_status:"suspended"};const blocked=await run();assert.equal(new URL(blocked.headers.get("location")).pathname,"/account-status");assert.equal(activeHeaders.has(context.PAGE_CONTEXT_HEADER),false);
 profile={...profile,account_status:"active"};withdrawal={request_id:"pending"};const pending=await run();assert.equal(new URL(pending.headers.get("location")).pathname,"/account-status");withdrawal=null;
 config={status:"restricted",blocked:{access:true},allowedAccess:{member:false}};const maintenance=await run();assert.equal(new URL(maintenance.headers.get("location")).pathname,"/maintenance");config={status:"normal"};
 profile={...profile,role:"admin"};config={status:"restricted",blocked:{liveTracking:true,participation:true,profile:true,scheduleCreation:true,comments:true}};
 await run("/tracking");assert.deepEqual((await auth.getCurrentPageProfile()).service_blocked,{});
 assert.deepEqual((await (await statusRoute.GET()).json()).blockedFeatures,{});
 profile={...profile,role:"member"};const featureDenied=await run("/tracking");assert.equal(new URL(featureDenied.headers.get("location")).pathname,"/maintenance");
 config={status:"normal"};
 delay=20;const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const before=[],after=[];
 for(let i=0;i<5;i++){
  calls=0;let started=performance.now();await run("/schedules",false);await auth.getCurrentPageProfile();before.push(performance.now()-started);assert.equal(calls,8);
  calls=0;started=performance.now();await run();await auth.getCurrentPageProfile();after.push(performance.now()-started);assert.equal(calls,4);
 }
 console.log(`Page context security tests passed; Supabase requests 8 -> 4. Controlled mock delay only (20ms/request), median ${median(before).toFixed(1)}ms -> ${median(after).toFixed(1)}ms. Not production measurements.`);
}finally{if(oldSecret===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldSecret;}
