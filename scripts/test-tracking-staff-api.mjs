import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const compile=(file,resolve)=>{const m=new Module(file);m.require=resolve;m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;};
const local=file=>compile(file,id=>local(path.resolve(path.dirname(file),id+'.ts')));
const access=local('src/lib/auth/account-access.ts'),validation=local('src/lib/race-tracking/validation.ts'),provider=local('src/lib/race-tracking/myresult.ts');
let profile=null,writes=[];const race='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',group='33333333-3333-4333-8333-333333333333';
const response={fail:(code,message,status=400)=>Response.json({success:false,error:{code,message}},{status}),ok:data=>Response.json({success:true,data})};
let memberName='홍길동',memberLookupError=null;
const {POST}=compile('src/app/api/tracking/[raceId]/route.ts',id=>{
 if(id==='@/lib/tracking-snapshot-server')return {};
 if(id==='@/lib/auth/account-access')return access;
 if(id==='@/lib/auth/current-user')return {getCurrentProfile:async()=>profile};
 if(id==='@/lib/api-response')return response;
 if(id==='@/lib/race-tracking/validation')return validation;
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>({from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>table==='profiles'?{data:memberName===null?null:{name:memberName},error:memberLookupError}:{data:{name:'대회',status:'active'},error:null}};return q;}})};
 if(id==='@/lib/supabase/server')return {createSupabaseServerClient:async()=>({rpc:async(fn,args)=>{writes.push({fn,args});return {error:null};}})};
 throw Error(id);
});
const entry={action:'entry',userId:user,bib:'00123',groupId:group,targetPaceSeconds:null};
const call=(body=entry)=>POST(new Request(`http://localhost/api/tracking/${race}`,{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify(body)}),{params:Promise.resolve({raceId:race})});
let count=0;const check=(a,b)=>{assert.deepEqual(a,b);count++;};
check((await call()).status,401);profile={role:'member',account_status:'active',approval_status:'approved'};check((await call()).status,403);
profile={...profile,role:'staff'};check((await call()).status,200);check(writes.length,1);
for(const body of [{action:'group',name:'B',paceSeconds:300},{action:'checkpoint',entryId:user,name:'5K',distanceMeters:5000,passedAt:'2026-10-25T09:25:00+09:00'},{action:'status',entryId:user,status:'dnf'},{action:'course',name:'코스',distanceMeters:10000,startAt:'2026-10-25T09:00:00+09:00',points:[{latitude:37,longitude:127},{latitude:38,longitude:127}]}])check((await call(body)).status,403);
check(writes.length,1);
profile={...profile,account_status:'restricted'};check((await call()).status,403);profile={...profile,account_status:'active',service_blocked:{liveTracking:true}};check((await call()).status,403);
profile={...profile,service_blocked:{},withdrawal_pending:true};check((await call()).status,403);
profile={role:'admin',account_status:'active',approval_status:'approved'};check((await call({action:'group',name:'B',paceSeconds:300})).status,200);
check(writes[0].args.payload.runnerName,'홍길동');
check((await call({...entry,runnerName:'가짜 이름'})).status,200);
check(writes.at(-1).args.payload.runnerName,'가짜 이름');
check(writes.at(-1).args.payload.userId,undefined);
memberName=null;check((await call({action:'entry',runnerName:'직접 입력',bib:'3987',groupId:group,targetPaceSeconds:null})).status,200);
check(writes.at(-1).args.payload.runnerName,'직접 입력');
check((await call({action:'entry',runnerName:' ',bib:'3987',groupId:group,targetPaceSeconds:null})).status,400);
const validWrites=writes.length;
memberName=' ';check((await call()).status,409);
memberName=null;check((await call()).status,409);
memberName='홍길동';memberLookupError={code:'08006'};check((await call()).status,503);
check(writes.length,validWrites);memberLookupError=null;

const snapshotClient={from:table=>{const results={
 profiles:[{user_id:user,name:'홍길동',nickname:'andy01'}],
 tracking_race_entries:[{entry_id:user,user_id:user,runner_name:'홍길동',bib:'00123',group_id:group,target_pace_seconds:300,status:'running'},{entry_id:group,user_id:null,runner_name:'외부 선수',bib:'3987',group_id:group,target_pace_seconds:300,status:'running'}],
 tracking_races:[{race_id:race,name:'대회',course_name:'10K',distance_meters:10000,start_at:'2026-10-25T09:00:00+09:00',status:'active',parent_race_id:null,points:[]}],
 tracking_pace_groups:[{group_id:group,name:'B',pace_seconds:300}],
 tracking_checkpoints:[{checkpoint_id:race,entry_id:group,name:'START',distance_meters:0,passed_at:'2026-10-25T00:05:58Z',received_at:'2026-10-25T00:42:00Z',source:'myresult'}],tracking_timing_sources:[],tracking_timing_sync:[],
 };const result={data:results[table],error:null};const q={select:()=>q,eq:()=>q,neq:()=>q,in:()=>q,or:()=>q,order:()=>q,limit:()=>q,range:()=>q,maybeSingle:async()=>({...result,data:result.data[0]??null}),then:resolve=>Promise.resolve(result).then(resolve)};return q;}};
const {loadTrackingSnapshot}=compile('src/lib/tracking-snapshot-server.ts',id=>{
 if(id==='@/lib/auth/account-access')return access;
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>snapshotClient};
 if(id==='@/lib/race-tracking/myresult-server')return {timingCredentials:()=>null};
 if(id==='@/lib/race-tracking/myresult')return provider;
 throw Error(id);
});
const snapshot=await loadTrackingSnapshot(race,profile);
check(snapshot.participants,[]);
check(snapshot.runners[1].name,'외부 선수');
check(snapshot.checkpoints[group][0].name,'START');
check(snapshot.runners[0].name,'홍길동');
const memberSnapshot=await loadTrackingSnapshot(race,{...profile,role:'member'});
check(memberSnapshot.runners.map(r=>r.bib),['00123','3987']);
check(memberSnapshot.entries,[]);

const event=provider.parseTimingEvent({id:176,date:'2026-10-25',name:'대회',courses:[{course_cd:'10K',distance:'10',points:[{point_cd:'P0',lap:1,name:'출발',distance:'0'},{point_cd:'P1',lap:1,name:'5K',distance:'5'}]}]},'176');
let key=false,requests=0,applies=[];
const require=Module.createRequire(import.meta.url);
const publicProvider=compile('src/lib/race-tracking/myresult-public.ts',id=>id==='cheerio'?require('cheerio'):provider);
const publicHTML=()=>'<div class="ant-card"><div class="ant-card-meta-title">대회</div><div class="ant-card-meta-description">2026-10-25</div></div><div class="card-player"><span class="ant-avatar-string">10K</span><div class="ant-card-meta-description">남자 | #123</div></div><div class="table-header"><div>구간명</div><div>통과시간</div><div>구간기록</div><div>누적기록</div></div><div class="table-row"><div>출발</div><div>'+(key?'09:00:00':'?')+'</div><div>-</div><div>-</div></div><div class="table-row"><div>5K</div><div>'+(key?'09:30:00':'?')+'</div><div>-</div><div>-</div></div>';
const syncClient={rpc:async(fn,args)=>fn==='claim_tracking_sync'?{data:{url:'https://myresult.co.kr/176',code:'10K',token:'lease',version:'version',cursor:null},error:null}:(applies.push(args),{error:null}),from:table=>table==='tracking_races'?{select:()=>({eq:()=>({single:async()=>({data:{distance_meters:10000,start_at:'2026-10-25T09:00:00+09:00'},error:null})})})}:(()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,gt:()=>q,then:resolve=>Promise.resolve({data:[{entry_id:user,bib:'00123'}],error:null}).then(resolve)};return q;})()};
const {synchronizeTracking}=compile('src/lib/race-tracking/sync-server.ts',id=>{
 if(id==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>syncClient};
 if(id==='./myresult')return provider;
 if(id==='./myresult-public')return {fetchPublicTimingHTML:async()=>{requests++;return publicHTML();},parsePublicTimingPlayer:publicProvider.parsePublicTimingPlayer};
 if(id==='./myresult-server')return {timingCredentials:()=>key?{'X-Fixture':'fixture'}:null,inspectTimingSource:async()=>event,fetchTimingJSON:async()=>{requests++;return {event_id:176,course_cd:'10K',num:123,records:[]};}};
 throw Error(id);
});
const realNow=Date.now;Date.now=()=>Date.parse('2026-10-25T10:00:00+09:00');
try{
check((await synchronizeTracking(race)).status,'synced');check(requests,1);check(applies[0].records,[]);
key=true;check((await synchronizeTracking(race)).status,'synced');check(requests,2);check(applies[1].token,'lease');check(applies[1].source_version,'version');
check(applies[1].records.map(r=>r.distanceMeters),[0,5000]);
}finally{Date.now=realNow;}
console.log(`Tracking staff API and sync orchestration: ${count} checks passed`);
