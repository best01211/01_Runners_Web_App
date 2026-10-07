import assert from "node:assert/strict";
import test from "node:test";
import { buildRanking, parseScorePolicy, DEFAULT_SCORE_POLICY, type RankingAttendance } from "../../src/lib/ranking";
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
 for(const patch of [{role:"admin"},{account_status:"restricted"},{approval_status:"pending"},{ranking_excluded:true},{is_test_account:true},{role:"guest"}]) {
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
