import assert from "node:assert/strict";import test from "node:test";
import {parseMaintenanceSetting,canAccessDuringService,featureBlocked,requestFeature} from "../../src/lib/service-policy";
test("full maintenance admits administrator, president and vice president only",()=>{
 const setting=parseMaintenanceSetting({status:"maintenance"})!;
 assert.equal(canAccessDuringService(setting,{role:"admin"}),true);assert.equal(canAccessDuringService(setting,{role:"staff"}),false);
 assert.equal(canAccessDuringService(setting,{role:"staff",staff_position:"president"}),true);assert.equal(canAccessDuringService(setting,{role:"staff",staff_position:"vice_president"}),true);
 assert.equal(canAccessDuringService(setting,{role:"member",is_pacer:true}),false);
});
test("partial restrictions independently select access grades and features",()=>{
 const setting=parseMaintenanceSetting({status:"restricted",blocked:{access:true,scheduleCreation:true,comments:true,participation:true,profile:true},allowedAccess:{admin:true,staff:false,pacer:true,member:false,guest:false}})!;
 assert.equal(canAccessDuringService(setting,{role:"admin"}),true);assert.equal(canAccessDuringService(setting,{role:"staff"}),false);
 assert.equal(canAccessDuringService(setting,{role:"staff",staff_position:"president"}),true);assert.equal(canAccessDuringService(setting,{role:"staff",staff_position:"vice_president"}),false);
 assert.equal(canAccessDuringService(setting,{role:"member",is_pacer:true}),true);assert.equal(canAccessDuringService(setting,{role:"member"}),false);
 for(const feature of ["scheduleCreation","comments","participation","profile"] as const)assert.equal(featureBlocked(setting,feature),true);
 assert.equal(requestFeature("/api/schedules","POST"),"scheduleCreation");assert.equal(requestFeature("/api/comments/id","PATCH"),"comments");
 assert.equal(requestFeature("/api/schedules/id/participation","DELETE"),null);assert.equal(requestFeature("/api/schedules/id/attendance","POST"),null);
 assert.equal(requestFeature("/api/profile/password","PATCH"),"profile");assert.equal(requestFeature("/api/admin/settings","PUT"),null);
});
test("settings reject malformed switches, dates and administrator lockout",()=>{
 for(const value of [{status:"bad"},{status:"restricted",blocked:{access:"true"}},{status:"restricted",allowedAccess:{admin:false}},{status:"normal",startsAt:"invalid"},{status:"normal",startsAt:"2026-10-14T12:00",endsAt:"2026-10-14T11:00"}])assert.equal(parseMaintenanceSetting(value),null);
 assert.equal(parseMaintenanceSetting({status:"normal",startsAt:"2026-10-14T12:00"})?.startsAt,"2026-10-14T03:00:00.000Z");
 assert.equal(parseMaintenanceSetting({status:"restricted"})?.blocked.access,true);
});

test('live tracking restrictions cover pages, APIs and schedule tracking without blocking unrelated pages',()=>{
 const setting=parseMaintenanceSetting({status:'restricted',blocked:{liveTracking:true}})!;
 assert.equal(featureBlocked(setting,'liveTracking'),true);
 for(const route of ['/tracking','/tracking/demo','/tracking/new','/tracking/abc','/api/tracking','/api/tracking/abc','/schedules/abc/tracking','/api/schedules/abc/tracking']){
  assert.equal(requestFeature(route,'GET'),'liveTracking');assert.equal(requestFeature(route,'POST'),'liveTracking');
 }
 for(const route of ['/dashboard','/profile','/schedules','/api/schedules/abc/attendance','/tracking-other'])assert.notEqual(requestFeature(route,'GET'),'liveTracking');
 assert.equal(featureBlocked(parseMaintenanceSetting({status:'normal',blocked:{liveTracking:true}})!,'liveTracking'),false);
 assert.equal(parseMaintenanceSetting({status:'restricted',blocked:{}})?.blocked.liveTracking,false);
});
