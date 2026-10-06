import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRaceWrite } from "../../src/lib/race-tracking/validation";
const id = "22222222-2222-4222-8222-222222222222";
const course = { action:"course", name:"서울레이스", distanceMeters:42195, startAt:"2026-10-11T08:00:00+09:00", points:[{latitude:37.5,longitude:127},{latitude:37.51,longitude:127.01}] };
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
