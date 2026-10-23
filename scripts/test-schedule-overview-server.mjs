import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import Module,{createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url);
function compile(file,resolve=require){const target=new Module(file);target.require=resolve;target._compile(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return target.exports;}
const overview=compile("src/lib/schedule-overview.ts");
const now="2026-10-01T00:00:00Z";
const event=id=>({schedule_id:String(id),schedule_type:"event",status:"open",start_at:"2026-10-10T00:00:00Z",end_at:"2026-10-10T01:00:00Z"});
let rows=[event(1)],rpcCalls=0,legacyCalls=0,mode="normal";
const client={rpc(){return {async range(from,to){rpcCalls++;if(mode==="missing")return {data:null,error:{code:"PGRST202"}};if(mode==="error"||mode==="later-error"&&from>0)return {data:null,error:{code:"XX000"}};return {data:rows.slice(from,to+1),error:null};}};},from(){legacyCalls++;const query={select(){return query},is(){return query},eq(){return query},neq(){return query},gte(){return query},lte(){return query},order(){return query},in(){return query},limit(){return Promise.resolve({data:[],error:null})},range(){return Promise.resolve({data:rows,error:null})}};return query;}};
const {loadUpcomingSchedules}=compile("src/lib/schedule-overview-server.ts",id=>id==="@/lib/supabase/admin"?{createSupabaseAdminClient:()=>client}:id==="./schedule-overview"?overview:require(id));
assert.equal((await loadUpcomingSchedules(now)).length,1);assert.equal(rpcCalls,1);assert.equal(legacyCalls,0);
rows=Array.from({length:1001},(_,i)=>event(i));rpcCalls=0;
assert.equal((await loadUpcomingSchedules(now)).length,1001);assert.equal(rpcCalls,3);
mode="missing";rows=[event(1)];legacyCalls=0;assert.equal((await loadUpcomingSchedules(now)).length,1);assert.equal(legacyCalls,3);
mode="error";await assert.rejects(()=>loadUpcomingSchedules(now));
mode="later-error";rows=Array.from({length:1001},(_,i)=>event(i));await assert.rejects(()=>loadUpcomingSchedules(now));
console.log("Schedule overview server: one RPC for normal lists, full pagination, safe missing-migration fallback and no partial results on errors passed");
