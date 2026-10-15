// Verify the real server page never sends administrator accounts or edit controls to staff.
import fs from 'node:fs';import Module from 'node:module';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let actor,queries=[];
const compile=(file,resolve)=>{const mod=new Module(file);mod.require=resolve;mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,file);return mod.exports;};
const access=compile('src/lib/auth/account-access.ts',require);
const base={account_status:'active',approval_status:'approved',is_pacer:false,ranking_excluded:false};
const members=[{...base,user_id:'admin-id',role:'admin',name:'관리자 비공개 계정',email:'admin@test.invalid',login_id:'administrator'},{...base,user_id:'staff-id',role:'staff',staff_position:'president',name:'회장 계정',email:'staff@test.invalid',login_id:'president'},{...base,user_id:'member-id',role:'member',name:'회원 계정',email:'member@test.invalid',login_id:'member'}];
const client={from(table){queries.push(table);let filters=[];const q={select(){return q},order(){return q},in(){return q},is(){return q},neq(key,value){filters.push([key,value]);return q},eq(){return q},async maybeSingle(){return {data:{setting_value:{}},error:null}},then(resolve){const data=table==='profiles'?members.filter(m=>filters.every(([key,v])=>m[key]!==v)):[];return Promise.resolve({data,error:null}).then(resolve)}};return q;}};
const page=compile('src/app/admin/page.tsx',id=>{
 if(id==='@/lib/regular-run-templates-server')return {loadRegularTemplates:async()=>[]};
 if(id==='@/lib/auth/account-access')return access;
 if(id==='@/lib/auth/current-user')return {getCurrentProfile:async()=>actor,isStaffOrAdmin:p=>access.canStartActivity(p)&&['staff','admin'].includes(p.role)};
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>client};
 if(id==='next/navigation')return {redirect:path=>{throw new Error('redirect:'+path)}};
 if(id==='next/link')return function Link(){return null};
 if(id.startsWith('@/components/')){const names=['RegularTemplateManager','MemberDirectory','MemberDelete','MemberActions','WithdrawalActions','SeasonManager','SeasonSettings','OperationsSettings','ServiceSettings'];return Object.fromEntries(names.map(name=>{const fn=()=>null;Object.defineProperty(fn,'name',{value:name});return [name,fn]}));}
 return require(id);
}).default;
function inspect(node,result={texts:[],components:[],links:[],directories:[]}){if(node==null||typeof node==='boolean')return result;if(typeof node==='string'||typeof node==='number'){result.texts.push(String(node));return result;}if(Array.isArray(node)){node.forEach(n=>inspect(n,result));return result;}if(typeof node==='object'){if(typeof node.type==='function')result.components.push(node.type.name);if(node.type?.name==='MemberDirectory')result.directories.push(node.props);if(node.props?.href)result.links.push(node.props.href);inspect(node.props?.children,result);}return result;}
for(const position of ['staff','vice_president','president']){
 actor={...base,user_id:'staff-id',role:'staff',staff_position:position};queries=[];
 const out=inspect(await page({searchParams:Promise.resolve({tab:'operations'})}));
 assert(!out.directories[0].members.some(m=>m.role==='admin'));assert(out.directories[0].members.some(m=>m.role==='member'));assert.equal(out.directories[0].canEdit,position==='president');assert(!queries.includes('system_settings'));
 if(position!=='president'){assert(!out.components.includes('MemberActions'));assert(!out.components.includes('MemberDelete'));assert(!out.links.some(h=>h.includes('tab=scores')));}
}
actor={...base,user_id:'admin-id',role:'admin'};let out=inspect(await page({searchParams:Promise.resolve({tab:'members'})}));assert(out.directories[0].members.some(m=>m.role==='admin'));assert(!out.links.some(h=>h.includes('operations')));assert(out.directories[0].canEdit);await assert.rejects(()=>page({searchParams:Promise.resolve({tab:'operations'})}),/redirect:\/admin\/operations/);
actor={...base,user_id:'member-id',role:'member'};await assert.rejects(()=>page({searchParams:Promise.resolve({})}),/redirect/);
console.log('회원 조회: 일반 운영진·부회장 읽기 전용 / 회장 관리자 숨김 / 관리자 전체 조회 / 일반회원 차단 검증 통과');

// Verify actual settings API checks, including direct requests bypassing the UI.
const settings=compile('src/app/api/admin/settings/route.ts',id=>{
 if(id==='@/lib/regular-run-templates-server')return {loadRegularTemplates:async()=>[]};
 if(id==='@/lib/auth/account-access')return access;
 if(id==='@/lib/auth/current-user')return {getCurrentProfile:async()=>actor};
 if(id==='@/lib/api-response')return {fail:(code,message,status=400)=>Response.json({success:false,error:{code,message}},{status}),ok:data=>Response.json({success:true,data})};
 if(id==='@/lib/ranking')return compile('src/lib/ranking.ts',require);
 if(id==='@/lib/service-policy')return compile('src/lib/service-policy.ts',dep=>dep==='./auth/account-access'?access:dep==='./korea-time'?compile('src/lib/korea-time.ts',require):require(dep));
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>({from(){return {upsert:()=>({select:()=>({single:async()=>({data:{},error:null})})})}}})};
 return require(id);
});
const put=(key,value)=>settings.PUT(new Request('http://localhost/api/admin/settings',{method:'PUT',headers:{origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({key,value})}));
actor={...base,user_id:'staff-id',role:'staff',staff_position:'president'};assert.equal((await put('maintenance',{status:'normal'})).status,403);
assert.equal((await put('score_policy',{attended:10,late:7,absent:0,pacer:3,minimumAttendance:3,includeGuests:false})).status,200);
actor={...base,user_id:'staff-id',role:'staff',staff_position:'vice_president'};assert.equal((await put('score_policy',{})).status,403);
actor={...base,user_id:'admin-id',role:'admin'};assert.equal((await put('maintenance',{status:'normal'})).status,200);
console.log('설정 API: 관리자만 운영 설정 변경 / 회장 점수 변경 허용 / 부회장 변경 차단 검증 통과');


const operations=compile('src/app/admin/operations/page.tsx',id=>{
 if(id==='@/lib/auth/current-user')return {getCurrentProfile:async()=>actor,isStaffOrAdmin:p=>access.canStartActivity(p)&&['staff','admin'].includes(p.role)};
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>client};
 if(id==='next/navigation')return {redirect:path=>{throw new Error('redirect:'+path)}};
 if(id==='next/link')return function Link(){return null};
 if(id==='@/components/admin/service-settings')return {ServiceSettings:()=>null};
 return require(id);
}).default;
actor={...base,role:'staff',staff_position:'president'};await assert.rejects(()=>operations(),/redirect/);
actor={...base,role:'admin'};assert(inspect(await operations()).texts.includes('관리자 · 운영 설정'));
console.log('별도 관리자 운영 화면: 회장 직접 접속 차단 / 관리자 접속 허용 검증 통과');

actor={...base,user_id:'admin-id',role:'admin'};
await assert.rejects(()=>page({searchParams:Promise.resolve({tab:'season-settings'})}),/redirect:\/admin\?tab=seasons/);
const seasonPage=inspect(await page({searchParams:Promise.resolve({tab:'seasons'})}));
assert(seasonPage.components.includes('SeasonManager'));assert(!seasonPage.links.some(h=>h.includes('tab=season-settings')));
console.log('시즌 관리 통합: 단일 메뉴 / 이전 시즌 설정 주소 이동 검증 통과');

actor={...base,user_id:'staff-id',role:'staff',staff_position:'staff'};
const templatePage=inspect(await page({searchParams:Promise.resolve({tab:'templates'})}));
assert(templatePage.components.includes('RegularTemplateManager'));assert(!templatePage.components.includes('SeasonManager'));assert(templatePage.links.includes('/admin?tab=templates'));
assert(!seasonPage.links.includes('/schedules/templates'));assert(!seasonPage.components.includes('RegularTemplateManager'));
console.log('정기런 양식: 별도 탭 분리 / 기존 운영진 접근 권한 유지 검증 통과');
