import assert from "node:assert/strict";
import test from "node:test";
import {buildCourse} from "../../src/lib/race-tracking/course";
import {cheerCandidates,cheerArrival} from "../../src/lib/race-tracking/cheering";
import {trackRunner} from "../../src/lib/race-tracking/engine";
const course=buildCourse([{latitude:0,longitude:0},{latitude:0,longitude:0.05},{latitude:0.001,longitude:0.05},{latitude:0.001,longitude:0}],10000);
const now=Date.parse("2027-03-21T00:10:00Z");
const runner={id:"r",name:"선수",bib:"01",startAt:new Date(now-600000).toISOString(),groupPaceSeconds:300,useGroupPrediction:true,status:"running" as const};
test("cheer snap retains distinct outbound/return course passages",()=>{
 const candidates=cheerCandidates(course,{latitude:0.0005,longitude:0.02});
 assert.ok(candidates.length>=2);assert.ok(candidates.at(-1)!.distanceMeters-candidates[0].distanceMeters>5000);
 assert.deepEqual(cheerCandidates(course,{latitude:1,longitude:1}),[]);
});
test("arrival separates predicted passage, recorded passage and unavailable timing",()=>{
 const s=trackRunner(runner,[],course,now);
 assert.equal(cheerArrival(s,1000,now).kind,"estimated-passed");
 const eta=cheerArrival(s,3000,now);assert.equal(eta.kind,"upcoming");assert.equal(eta.seconds,300);
 assert.equal(cheerArrival({...s,status:"stale"},3000,now).kind,"unavailable");
 assert.equal(cheerArrival({...s,lastCheckpoint:{id:"cp",name:"5K",distanceMeters:5000,passedAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString(),source:"manual"}},3000,now).kind,"confirmed");
 assert.equal(cheerArrival({...s,status:"dnf"},3000,now).kind,"unavailable");
});

test("pre-start cheering ETA uses planned start, not current time",()=>{
 const future={...runner,startAt:new Date(now+600000).toISOString()};
 const state=trackRunner(future,[],course,now);
 const arrival=cheerArrival(state,1000,now);
 assert.equal(arrival.seconds,900);
});
