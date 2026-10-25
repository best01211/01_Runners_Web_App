import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRaceWrite } from "../../src/lib/race-tracking/validation";
import {nextTrackingRefresh,canRefreshTracking} from "../../src/lib/race-tracking/refresh-policy";
const id = "22222222-2222-4222-8222-222222222222";
test("refresh follows race-start three-minute boundaries and a silent one-minute cooldown",()=>{
 const start=Date.parse('2026-10-25T09:00:00+09:00');
 assert.equal(nextTrackingRefresh(new Date(start).toISOString(),start-1),start);
 assert.equal(nextTrackingRefresh(new Date(start).toISOString(),start+1),start+180000);
 assert.equal(nextTrackingRefresh(new Date(start).toISOString(),start+180000),start+360000);
 assert.equal(canRefreshTracking(start+59999,start),false);
 assert.equal(canRefreshTracking(start+60000,start),true);
});
test("registration permits an unspecified group and validates correction actions",()=>{
 const e=validateRaceWrite({action:'entry',runnerName:'외부 선수',bib:'3987',groupId:null,targetPaceSeconds:null});
 assert.equal(e.action,'entry');if(e.action==='entry')assert.equal(e.groupId,null);
 assert.deepEqual(validateRaceWrite({action:'entry-delete',entryId:id}),{action:'entry-delete',entryId:id});
 assert.deepEqual(validateRaceWrite({action:'entry-move',entryId:id,courseId:id}),{action:'entry-move',entryId:id,courseId:id,groupId:null});
 assert.throws(()=>validateRaceWrite({action:'entry-move',entryId:id,courseId:'fake'}));
});
const course = { action:"course", name:"서울레이스", distanceMeters:42195, startAt:"2026-10-11T08:00:00+09:00", points:[{latitude:37.5,longitude:127},{latitude:37.51,longitude:127.01}] };
test("registers a typed runner name without a member account",()=>{
 const input={action:"entry",runnerName:"  외부 선수  ",bib:"003987",groupId:id,targetPaceSeconds:null};
 assert.deepEqual(validateRaceWrite(input),{action:"entry",runnerName:"외부 선수",bib:"003987",groupId:id,targetPaceSeconds:null});
 for(const runnerName of ["", " ", "가".repeat(51), "이름\n입력", null, 123])assert.throws(()=>validateRaceWrite({...input,runnerName}));
 assert.throws(()=>validateRaceWrite({...input,entryId:"fake"}));
 assert.equal((validateRaceWrite({...input,entryId:id}) as {entryId:string}).entryId,id);
});
test("course normalizes timezone and strips additional coordinate fields",()=> {
 const result = validateRaceWrite({...course, points:course.points.map(p=>({...p, email:"ignored"}))});
 assert.equal(result.action,"course");
 if(result.action==="course"){ assert.equal(result.startAt,"2026-10-10T23:00:00.000Z"); assert.deepEqual(Object.keys(result.points[0]).sort(),["latitude","longitude"]); }
});
test("rejects malformed, disconnected, zero-length and oversized coordinate input",()=> {
 for(const points of [[], [course.points[0]], [course.points[0],course.points[0]], [{latitude:91,longitude:127},course.points[0]], Array(20001).fill(course.points[0])]) assert.throws(()=>validateRaceWrite({...course,points}));
});
test("rejects invalid official distance and timezone-free time",()=> {
 for(const distanceMeters of [0,999,100001,NaN,Infinity,"42195"]) assert.throws(()=>validateRaceWrite({...course,distanceMeters}));
 assert.throws(()=>validateRaceWrite({...course,startAt:"2026-10-11T08:00:00"}));
});
test("keeps leading zeros in BIB and enforces target pace bounds",()=> {
 assert.deepEqual(validateRaceWrite({action:"entry",userId:id,bib:" 00100 ",targetPaceSeconds:null}),{action:"entry",userId:id,bib:"00100",targetPaceSeconds:null});
 for(const targetPaceSeconds of [119,1201,360.5,Infinity,"360",undefined]) assert.throws(()=>validateRaceWrite({action:"entry",userId:id,bib:"100",targetPaceSeconds}));
});
test("rejects HTML BIB, spoofed IDs and unrecognized status/action",()=> {
 assert.throws(()=>validateRaceWrite({action:"entry",userId:id,bib:"<img>",targetPaceSeconds:360}));
 assert.throws(()=>validateRaceWrite({action:"entry",userId:"other",bib:"100",targetPaceSeconds:360}));
 assert.throws(()=>validateRaceWrite({action:"status",entryId:id,status:"finished"}));
 assert.throws(()=>validateRaceWrite({action:"delete",entryId:id}));
});
test("checkpoint validation retains exact finish distance and normalized time",()=> {
 const result=validateRaceWrite({action:"checkpoint",entryId:id,name:" FINISH ",distanceMeters:42195,passedAt:"2026-10-11T12:00:00+09:00"});
 assert.deepEqual(result,{action:"checkpoint",entryId:id,name:"FINISH",distanceMeters:42195,passedAt:"2026-10-11T03:00:00.000Z"});
 assert.throws(()=>validateRaceWrite({action:"checkpoint",entryId:id,name:"5K",distanceMeters:-1,passedAt:course.startAt}));
});

test("groups and course parents validate IDs and integer pace bounds",()=>{
 assert.deepEqual(validateRaceWrite({action:"group",name:" B그룹 ",paceSeconds:330}),{action:"group",name:"B그룹",paceSeconds:330});
 for(const paceSeconds of [119,1201,300.5,NaN,"300"])assert.throws(()=>validateRaceWrite({action:"group",name:"B",paceSeconds}));
 assert.throws(()=>validateRaceWrite({...course,parentRaceId:"fake",courseName:"10K"}));
 assert.throws(()=>validateRaceWrite({...course,courseName:" "}));
 const entry=validateRaceWrite({action:"entry",userId:id,bib:"001",targetPaceSeconds:null,groupId:id});
 assert.equal(entry.action,"entry");if(entry.action==="entry")assert.equal(entry.groupId,id);
 assert.throws(()=>validateRaceWrite({action:"entry",userId:id,bib:"001",targetPaceSeconds:null,groupId:"fake"}));
});

import {validateRegistration,MAX_GPX_FILE_BYTES,MAX_REGISTRATION_BYTES} from "../../src/lib/race-tracking/registration";
test("multi-course registration preserves independent GPX, official distance and start",()=>{
 const full={...course,courseName:"풀코스"};
 const ten={...course,courseName:"10K",distanceMeters:10000,startAt:"2026-10-11T09:00:00+09:00",points:[{latitude:36,longitude:128},{latitude:36.1,longitude:128.1}]};
 const r=validateRegistration({name:" 춘천 ",location:" 춘천시 ",courses:[full,ten]});
 assert.equal(r.name,"춘천");assert.equal(r.courses.length,2);assert.equal(r.courses[0].distanceMeters,42195);assert.equal(r.courses[1].distanceMeters,10000);
 assert.notEqual(r.courses[0].startAt,r.courses[1].startAt);assert.notDeepEqual(r.courses[0].points,r.courses[1].points);
 assert.equal(MAX_GPX_FILE_BYTES,10000000);assert.ok(MAX_REGISTRATION_BYTES<4500000);
});
test("multi-course registration rejects duplicates, missing GPX and invalid parent",()=>{
 const c={...course,courseName:"10K"};
 for(const courses of [[],Array(21).fill(c),[c,{...c,courseName:" 10K "}],[{...c,points:[]}],[{...c,courseName:undefined}]])assert.throws(()=>validateRegistration({name:"대회",location:"",courses}));
 assert.throws(()=>validateRegistration({name:"대회",location:"",parentRaceId:"fake",courses:[c]}));
 const r=validateRegistration({name:"대회",location:"",parentRaceId:id,courses:[c]});assert.equal(r.parentRaceId,id);
});
