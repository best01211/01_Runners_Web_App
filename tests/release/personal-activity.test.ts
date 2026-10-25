import assert from "node:assert/strict";
import test from "node:test";
import {buildPersonalActivity} from "../../src/lib/personal-activity";
import {DEFAULT_SCORE_POLICY,type RankingAttendance} from "../../src/lib/ranking";

const row=(user_id:string,status:string,schedule_id:string):RankingAttendance=>({user_id,status,schedule_id,profiles:{login_id:user_id,nickname:null,role:'member',account_status:'active',approval_status:'approved',ranking_excluded:false,is_test_account:false},schedules:{start_at:'2026-10-15T00:00:00Z',status:'open',deleted_at:null}});
const policy={...DEFAULT_SCORE_POLICY,minimumAttendance:1};

test('personal activity uses the ranking order, score and pacer bonus',()=>{
 const summary=buildPersonalActivity([row('other','attended','1'),row('me','attended','1'),row('me','late','2'),row('me','absent','3')],policy,new Set(['1:me']),'me');
 assert.deepEqual(summary,{rank:1,score:20,attended:1,late:1,absent:1,total:3,attendanceRate:67});
});
test('minimum activity hides rank without discarding earned points and attendance',()=>{
 const summary=buildPersonalActivity([row('me','attended','1')],DEFAULT_SCORE_POLICY,new Set(),'me');
 assert.equal(summary.rank,null);assert.equal(summary.score,10);assert.equal(summary.attended,1);
});
test('personal attendance respects season boundaries and ignores cancelled or deleted events',()=>{
 const rows=[row('me','attended','1'),row('me','late','2'),row('me','absent','3'),row('me','attended','4'),row('other','attended','5')];
 rows[1].schedules!.status='cancelled';rows[2].schedules!.deleted_at='2026-10-15';rows[3].schedules!.start_at='2026-09-30T14:59:59Z';
 const summary=buildPersonalActivity(rows,policy,new Set(),'me',{starts_on:'2026-10-01',ends_on:'2026-10-31'});
 assert.equal(summary.total,1);assert.equal(summary.score,10);assert.equal(summary.attendanceRate,100);
});
test('excluded users retain their own attendance but receive no ranking score or rank',()=>{
 const record=row('me','late','1');record.profiles!.ranking_excluded=true;
 const summary=buildPersonalActivity([record],policy,new Set(),'me');
 assert.equal(summary.rank,null);assert.equal(summary.score,null);assert.equal(summary.late,1);
 assert.deepEqual(buildPersonalActivity([],policy,new Set(),'me'),{rank:null,score:null,attended:0,late:0,absent:0,total:0,attendanceRate:null});
});

test('personal rank and earned score survive switching back to administrator mode',()=>{
 const records=[row('me','attended','1'),row('me','late','2'),row('me','attended','3')];
 for(const r of records)r.profiles!.role='staff';
 const staff=buildPersonalActivity(records,DEFAULT_SCORE_POLICY,new Set(['1:me']),'me');
 for(const r of records)r.profiles!.role='admin';
 assert.deepEqual(buildPersonalActivity(records,DEFAULT_SCORE_POLICY,new Set(['1:me']),'me'),staff);
 assert.equal(staff.rank,1);assert.equal(staff.score,30);
});
