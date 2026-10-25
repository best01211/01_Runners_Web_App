// Render the actual dashboard with a deliberately blocked ranking query.
// This verifies that real schedule content, not just its fallback, streams first.
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import path from "node:path";
import React from "react";
import {renderToReadableStream} from "react-dom/server";
import ts from "typescript";
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL("../",import.meta.url));
let finishRanking;let scheduleReads=0;let rankingReads=0;
const ranking=new Promise(resolve=>{finishRanking=resolve;});
const modules=new Map();
const mocks={
 "@/lib/member-journey-server":{loadMySchedules:async()=>[],upcomingMine:()=>[]},
 "@/lib/auth/current-user":{getCurrentPageProfile:async()=>({user_id:"me",name:"테스트",nickname:null,role:"member",account_status:"active",approval_status:"approved"})},
 "@/lib/ranking-server":{loadRanking:()=>{rankingReads++;return ranking;}},
 "@/lib/schedule-overview-server":{loadUpcomingSchedules:async()=>{scheduleReads++;return [{schedule_id:"test",title:"STREAMED_SCHEDULE_DATA",schedule_type:"regular",status:"open",start_at:"2099-01-01T00:00:00Z",end_at:"2099-01-01T01:00:00Z",registration_end_at:"2098-12-31T00:00:00Z",location:"잠실",capacity:60}];}},
};
function load(filename){
 if(modules.has(filename))return modules.get(filename).exports;
 const evaluated={exports:{}};modules.set(filename,evaluated);
 const compiled=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const localRequire=specifier=>{
  if(mocks[specifier])return mocks[specifier];
  if(specifier.startsWith("@/")||specifier.startsWith(".")){
   const base=specifier.startsWith("@/")?path.join(root,"src",specifier.slice(2)):path.resolve(path.dirname(filename),specifier);
   const target=[base+".ts",base+".tsx",base].find(p=>existsSync(p));
   return load(target);
  }
  return require(specifier);
 };
 new Function("require","module","exports",compiled)(localRequire,evaluated,evaluated.exports);
 return evaluated.exports;
}
const Page=load(path.join(root,"src/app/dashboard/page.tsx")).default;
const stream=await renderToReadableStream(React.createElement(Page));
const reader=stream.getReader();const decoder=new TextDecoder();let html="";
let timer;
try{
 await Promise.race([
  (async()=>{while(!html.includes("STREAMED_SCHEDULE_DATA")){const chunk=await reader.read();assert.equal(chunk.done,false);html+=decoder.decode(chunk.value);}})(),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Schedule content waited for the blocked ranking query")),5000);}),
 ]);
 clearTimeout(timer);
 assert.equal(scheduleReads,1);assert.equal(rankingReads,1);
 finishRanking({personalActivity:{rank:7,score:30,attended:3,late:0,absent:0,total:3,attendanceRate:100,seasonName:"STREAMED_ACTIVITY_DATA"}});
 for(;;){const chunk=await reader.read();if(chunk.done)break;html+=decoder.decode(chunk.value);}
 assert.ok(html.includes("STREAMED_ACTIVITY_DATA"));
 assert.ok(html.indexOf("STREAMED_SCHEDULE_DATA")<html.indexOf("STREAMED_ACTIVITY_DATA"));
 console.log("Dashboard streaming: schedule data arrives before ranking, with one shared schedule read");
}finally{clearTimeout(timer);finishRanking(null);reader.releaseLock();}
