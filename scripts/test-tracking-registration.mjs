// Actual registration route with real validation, isolated auth and RPC transport.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
const compile=(file,resolve)=>{const m=new Module(file);m.require=resolve;m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;};
const local=file=>compile(file,id=>{if(id.startsWith('.'))return local(path.resolve(path.dirname(file),id+'.ts'));throw Error(id);});
const access=local('src/lib/auth/account-access.ts'),validation=local('src/lib/race-tracking/validation.ts'),registration=local('src/lib/race-tracking/registration.ts');
let profile=null,rpcs=[],dbError=null;
const {POST}=compile('src/app/api/tracking/route.ts',id=>{
 if(id==='@/lib/auth/account-access')return access;
 if(id==='@/lib/auth/current-user')return {getCurrentProfile:async()=>profile};
 if(id==='@/lib/race-tracking/validation')return validation;
 if(id==='@/lib/race-tracking/registration')return registration;
 if(id==='@/lib/api-response')return {fail:(code,message,status=400)=>Response.json({success:false,error:{code,message}},{status}),ok:(data,status=200)=>Response.json({success:true,data},{status})};
 if(id==='@/lib/supabase/server')return {createSupabaseServerClient:async()=>({rpc:async(name,args)=>{rpcs.push({name,args});return {data:'event-id',error:dbError};}})};
 throw Error(id);
});
let checks=0;const check=(a,b)=>{assert.equal(a,b);checks++;};
const active={role:'admin',account_status:'active',approval_status:'approved'};
const course={courseName:'풀코스',distanceMeters:42195,startAt:'2026-10-25T09:00:00+09:00',points:[{latitude:37,longitude:127},{latitude:38,longitude:127}]};
const batch={action:'event',name:'춘천',location:'춘천',courses:[course,{...course,courseName:'10K',distanceMeters:10000}]};
const call=(data=batch,origin='http://localhost')=>POST(new Request('http://localhost/api/tracking',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)}));
check((await call()).status,401);
for(const p of [{...active,role:'member'},{...active,account_status:'suspended'},{...active,withdrawal_pending:true},{...active,approval_status:'pending'},{...active,role:'staff',staff_position:'president',service_blocked:{liveTracking:true}}]){profile=p;check((await call()).status,403);}
profile=active;check((await call(batch,'https://foreign.example')).status,403);check(rpcs.length,0);
check((await call({...batch,courses:[course,{...course,courseName:' 풀코스 '}]})).status,400);check(rpcs.length,0);
check((await call()).status,201);check(rpcs.length,1);check(rpcs[0].name,'create_tracking_event');check(rpcs[0].args.payload.courses[1].distanceMeters,10000);
check((await call({action:'course',name:'legacy',location:'',...course})).status,201);check(rpcs.at(-1).name,'create_tracking_race');
dbError={code:'PGRST202'};const setup=await call();check(setup.status,409);assert.match((await setup.json()).error.message,/029/);checks++;
const before=rpcs.length;check((await call({...batch,padding:'x'.repeat(registration.MAX_REGISTRATION_BYTES)})).status,413);check(rpcs.length,before);
console.log(`Multi-course registration API: ${checks} authorization, validation, atomic RPC, compatibility and size checks passed`);
