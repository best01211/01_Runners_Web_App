import assert from "node:assert/strict";
import test from "node:test";
import { formatRankingName, selectRankingDisplay, buildRanking, parseScorePolicy, DEFAULT_SCORE_POLICY, type RankingAttendance } from "../../src/lib/ranking";
import { canEditScheduleType } from "../../src/lib/validation/schedule-permissions";
const row = (id: string, status="attended", at="2026-10-07T01:00:00Z"): RankingAttendance => ({user_id:id,schedule_id:"race",status,profiles:{login_id:id,nickname:null,role:"member",account_status:"active",approval_status:"approved",ranking_excluded:false,is_test_account:false},schedules:{start_at:at,status:"attendance_closed",deleted_at:null}});
const policy={...DEFAULT_SCORE_POLICY,minimumAttendance:0};
test("member cannot convert flash run to privileged schedule types",()=>{
 for(const type of ["regular","training","event"]) assert.equal(canEditScheduleType("member",type),false);
 assert.equal(canEditScheduleType("member","flash"),true);
 assert.equal(canEditScheduleType("guest","flash"),false);
 assert.equal(canEditScheduleType("staff","event"),true);
});
test("configured scores and pacer bonus apply only to present participants",()=>{
 const result=buildRanking([row("a"),row("b","late"),row("c","absent")],{...policy,attended:20,late:12,absent:1,pacer:4},new Set(["race:a","race:b","race:c"]));
 assert.deepEqual(result.map(r=>r.score),[24,16,1]);
});
test("minimum activity counts attended plus late, not absent",()=>{
 assert.equal(buildRanking([row("a","absent")],{...policy,minimumAttendance:1},new Set()).length,0);
 assert.equal(buildRanking([row("a","late")],{...policy,minimumAttendance:1},new Set()).length,1);
});
test("season boundaries use Korea time and include entire end date",()=>{
 const result=buildRanking([row("before","attended","2026-10-06T14:59:59Z"),row("start","attended","2026-10-06T15:00:00Z"),row("end","attended","2026-10-07T14:59:59Z"),row("after","attended","2026-10-07T15:00:00Z")],policy,new Set(),{starts_on:"2026-10-07",ends_on:"2026-10-07"});
 assert.deepEqual(new Set(result.map(r=>r.userId)),new Set(["start","end"]));
});
test("hidden, inactive, excluded and test accounts cannot rank",()=>{
 for(const patch of [{account_status:"restricted"},{approval_status:"pending"},{ranking_excluded:true},{is_test_account:true},{role:"guest"}]) {
 const x=row("a");Object.assign(x.profiles!,patch);assert.equal(buildRanking([x],policy,new Set()).length,0);
 }
 const guest=row("g");guest.profiles!.role="guest";assert.equal(buildRanking([guest],{...policy,includeGuests:true},new Set()).length,1);
});
test("cancelled and deleted schedules cannot contribute",()=>{
 const cancelled=row("a"),deleted=row("b");cancelled.schedules!.status="cancelled";deleted.schedules!.deleted_at="2026-10-07";
 assert.equal(buildRanking([cancelled,deleted],policy,new Set()).length,0);
});
test("invalid policies fail validation",()=>{
 for(const attended of [-1,0.5,"10",Infinity,100001]) assert.equal(parseScorePolicy({...policy,attended}),null);
 assert.equal(parseScorePolicy({...policy,includeGuests:"false"}),null);
 assert.deepEqual(parseScorePolicy(policy),policy);
});

test("ranking names use nickname and real name without exposing login id",()=>{
 assert.equal(formatRankingName({name:"홍길동",nickname:"러너"}),"러너 < 홍길동");
 assert.equal(formatRankingName({name:"홍길동",nickname:"  "}),"홍길동");
});
test("ranking shows top ten and own row only when outside top ten",()=>{
 const rows=Array.from({length:60},(_,i)=>({userId:String(i+1)}));
 const outside=selectRankingDisplay(rows,"42");
 assert.equal(outside.podium.length,3);assert.equal(outside.leaders.length,7);
 assert.equal(outside.own?.rank,42);assert.equal(outside.own?.row.userId,"42");
 assert.equal(selectRankingDisplay(rows,"10").own,null);
 assert.equal(selectRankingDisplay(rows,"missing").own,null);
 assert.equal(selectRankingDisplay(rows.slice(0,2),"1").podium.length,2);
});

test('real attendance keeps identical scores and order when an administrator switches modes',()=>{
 const real=[row('me','attended'),row('me','late'),row('other','attended')];
 real[0].schedule_id='run1';real[1].schedule_id='run2';real[2].schedule_id='run1';
 const pacers=new Set(['run1:me']);
 for(const item of real.filter(r=>r.user_id==='me'))item.profiles!.role='staff';
 const staff=buildRanking(real,{...policy,minimumAttendance:2},pacers);
 for(const item of real.filter(r=>r.user_id==='me'))item.profiles!.role='admin';
 assert.deepEqual(buildRanking(real,{...policy,minimumAttendance:2},pacers),staff);
 assert.equal(staff[0].score,20);assert.equal(staff[0].attended,1);assert.equal(staff[0].late,1);
 assert.equal(buildRanking(real,{...policy,minimumAttendance:3},pacers).length,0);
 for(const flag of ['ranking_excluded','is_test_account'] as const){
  const excluded=row('me');excluded.profiles!.role='admin';excluded.profiles![flag]=true;
  assert.equal(buildRanking([excluded],policy,pacers).length,0);
 }
});
