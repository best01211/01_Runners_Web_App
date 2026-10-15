import fs from 'node:fs';import Module from 'node:module';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const compile=(file,resolve=require)=>{const m=new Module(file);m.require=resolve;m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);return m.exports;};
const lib=compile('src/lib/member-directory.ts');let actor={role:'staff',account_status:'active',approval_status:'approved'};
const adminId='11111111-1111-4111-8111-111111111111',memberId='22222222-2222-4222-8222-222222222222';
const members=[{user_id:adminId,name:'관리자',role:'admin'},{user_id:memberId,name:'=위험한수식',nickname:'달림,"이름"\n둘째줄',role:'member'}];
const client={from(){let predicates=[];const q={select(){return q},eq(k,v){predicates.push(m=>m[k]===v);return q},neq(k,v){predicates.push(m=>m[k]!==v);return q},in(k,vs){predicates.push(m=>vs.includes(m[k]));return q},maybeSingle(){return Promise.resolve({data:members.find(m=>predicates.every(f=>f(m)))??null,error:null})},then(resolve){return Promise.resolve({data:members.filter(m=>predicates.every(f=>f(m))),error:null}).then(resolve)}};return q;}};
let attendanceCalls=0;
const resolve=id=>id==='@/lib/auth/current-user'?{getCurrentProfile:async()=>actor,isStaffOrAdmin:p=>p?.account_status==='active'&&['admin','staff'].includes(p.role)}:id==='@/lib/supabase/admin'?{createSupabaseAdminClient:()=>client}:id==='@/lib/supabase/server'?{}:id==='@/lib/member-directory'?lib:id==='@/lib/member-attendance'?{memberAttendance:async()=>{attendanceCalls++;return [{attendance_id:'a',user_id:memberId,status:'attended',method:'code',checked_at:'2026-10-15T01:00:00Z',schedules:{title:'정기런',start_at:'2026-10-15T00:00:00Z',location:'한강',status:'completed',deleted_at:null}}]}}:id==='@/lib/api-response'?{ok:data=>Response.json({success:true,data}),fail:(code,message,status=400)=>Response.json({success:false,error:{code,message}},{status})}:require(id);
const detail=compile('src/app/api/admin/members/[userId]/route.ts',resolve),csv=compile('src/app/api/admin/members/attendance-export/route.ts',resolve);
const get=id=>detail.GET(new Request('http://localhost/api'),{params:Promise.resolve({userId:id})});
const post=(ids,origin='http://localhost')=>csv.POST(new Request('http://localhost/api',{method:'POST',headers:{origin},body:JSON.stringify({userIds:ids})}));
assert.equal((await get(adminId)).status,404);assert.equal(attendanceCalls,0);assert.equal((await get('invalid')).status,400);assert.equal((await get(memberId)).status,200);
assert.equal((await post([adminId,memberId])).status,403);assert.equal((await post([])).status,400);assert.equal((await post(['invalid'])).status,400);assert.equal((await post([memberId],'http://other')).status,403);
const response=await post([memberId,memberId]);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');const bytes=new Uint8Array(await response.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);const text=new TextDecoder().decode(bytes);assert(text.includes('"\'=위험한수식"'));assert(text.includes('달림,""이름""\n둘째줄'));assert(text.includes('출석'));assert.equal(text.split('"\'=위험한수식"').length,2);
actor={role:'member',account_status:'active'};assert.equal((await get(memberId)).status,403);assert.equal((await post([memberId])).status,403);
actor={role:'admin',account_status:'active'};assert.equal((await get(adminId)).status,200);assert.equal((await post([adminId])).status,200);
assert.equal(lib.csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
// Verify history pagination goes beyond Supabase's default result limit.
const pages=[];const history=compile('src/lib/member-attendance.ts',id=>id==='@/lib/supabase/admin'?{createSupabaseAdminClient:()=>({from(){const q={select(){return q},in(){return q},order(){return q},range(start,end){pages.push([start,end]);return Promise.resolve({data:Array.from({length:start<1000?500:1},(_,i)=>({attendance_id:String(start+i)})),error:null})}};return q}})}:require(id));
assert.equal((await history.memberAttendance([memberId])).length,1001);assert.equal(pages.length,3);
console.log('회원 상세·CSV API 권한, 관리자 숨김, 선택 검증, UTF-8 BOM, 수식 방지, 인용 처리, 1,001건 페이지 조회 통과');

// Detail is a protected standalone page; settings requests do not load attendance history.
actor={role:'staff',account_status:'active',approval_status:'approved'};
const before=attendanceCalls;
const settingsOnly=await detail.GET(new Request('http://localhost/api?view=settings'),{params:Promise.resolve({userId:memberId})});
assert.equal(settingsOnly.status,200);assert.equal(attendanceCalls,before);assert.equal((await settingsOnly.json()).data.attendances,undefined);
const page=compile('src/app/admin/members/[userId]/page.tsx',id=>{
 if(id==='next/navigation')return {notFound(){throw new Error('NOT_FOUND')},redirect(){throw new Error('REDIRECT')}};
 if(id==='next/link')return function Link(){return null};
 if(id==='@/lib/auth/account-access')return compile('src/lib/auth/account-access.ts');
 if(id==='@/components/admin/member-actions')return {MemberActions:()=>null};
 if(id==='@/components/admin/member-detail')return {MemberDetailView:()=>null};
 return resolve(id);
}).default;
const open=id=>page({params:Promise.resolve({userId:id})});
await assert.rejects(()=>open(adminId),/NOT_FOUND/);await assert.rejects(()=>open('invalid'),/NOT_FOUND/);assert(await open(memberId));
actor={role:'member',account_status:'active'};await assert.rejects(()=>open(memberId),/REDIRECT/);
actor={role:'admin',account_status:'active'};assert(await open(adminId));
console.log('독립 상세 페이지 권한·주소 검증, 설정 조회의 출석 이력 미로딩 통과');

const hasStatusControl=node=>!!node&&(Array.isArray(node)?node.some(hasStatusControl):typeof node==='object'&&(node.props?.statusOnly===true||hasStatusControl(node.props?.children)));
members.forEach(m=>{m.approval_status='approved';m.account_status='active';});
actor={role:'staff',staff_position:'vice_president',account_status:'active',approval_status:'approved'};assert(!hasStatusControl(await open(memberId)));
actor={role:'staff',staff_position:'president',account_status:'active',approval_status:'approved'};assert(hasStatusControl(await open(memberId)));
actor={role:'admin',account_status:'active',approval_status:'approved'};assert(hasStatusControl(await open(memberId)));
console.log('상세 활성 설정: 관리자·회장 표시 / 부회장 조회 전용 검증 통과');
