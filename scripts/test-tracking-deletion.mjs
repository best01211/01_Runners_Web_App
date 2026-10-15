// Exercise the actual DELETE handler without connecting to Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

let profile=null, row={race_id:'11111111-1111-4111-8111-111111111111'}, dbError=null, writes=0;
const compile=(file,resolve)=>{
 const mod=new Module(file);mod.require=resolve;
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
 return mod.exports;
};
const access=compile('src/lib/auth/account-access.ts',id=>{throw new Error(id)});
const route=compile('src/app/api/tracking/[raceId]/route.ts',id=>{
 if(id==='@/lib/auth/account-access')return access;
 if(id==='@/lib/auth/current-user')return {getCurrentProfile:async()=>profile};
 if(id==='@/lib/api-response')return {fail:(code,message,status=400)=>Response.json({success:false,error:{code,message}},{status}),ok:data=>Response.json({success:true,data})};
 if(id==='@/lib/race-tracking/validation')return {isUUID:value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)};
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>({from(table){assert.equal(table,'tracking_races');return {update(value){assert.deepEqual(value,{status:'archived'});writes++;return {eq(key,value){assert.equal(key,'race_id');assert.equal(value,row?.race_id??uuid);return {select:()=>({maybeSingle:async()=>({data:row,error:dbError})})}}}}}}})};
 if(id==='@/lib/supabase/server')return {};
 throw new Error(`Unexpected import: ${id}`);
});
const uuid='11111111-1111-4111-8111-111111111111';
const call=(raceId=uuid,origin='http://localhost')=>route.DELETE(new Request(`http://localhost/api/tracking/${raceId}`,{method:'DELETE',headers:{origin}}),{params:Promise.resolve({raceId})});
assert.equal((await call()).status,401);
const active={account_status:'active',approval_status:'approved'};
for(const p of [
 {...active,role:'member'},
 {...active,role:'staff',staff_position:'staff'},
 {...active,role:'staff',staff_position:'vice_president'},
 {...active,role:'admin',account_status:'restricted'},
 {...active,role:'admin',withdrawal_pending:true},
 {...active,role:'admin',approval_status:'pending'},
]) {profile=p;assert.equal((await call()).status,403);}
assert.equal(writes,0);
profile={...active,role:'admin'};
assert.equal((await call(uuid,'https://foreign.example')).status,403);
assert.equal((await call('invalid')).status,404);
assert.equal(writes,0);
assert.equal((await call()).status,200);
assert.equal((await call()).status,200); // Already archived requests remain safe to repeat.
profile={...active,role:'staff',staff_position:'president'};
assert.equal((await call()).status,200);
dbError={code:'XX000'};assert.equal((await call()).status,503);
dbError=null;row=null;assert.equal((await call()).status,404);
console.log('추적 삭제 API: 권한·출처·잘못된 ID·보관·재요청·DB 실패·미존재 검증 통과');
