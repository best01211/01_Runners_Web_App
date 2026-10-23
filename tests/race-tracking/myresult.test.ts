import assert from 'node:assert/strict';
import test from 'node:test';
import {myResultSource,parseTimingEvent,parseTimingPlayer} from '../../src/lib/race-tracking/myresult';
import {fetchTimingJSON,timingCredentials} from '../../src/lib/race-tracking/myresult-server';
const raw={id:176,name:'2026 춘천마라톤',date:'2026-10-25',courses:[{course_cd:'Full',explain:'마스터스 풀코스',distance:'42.195',points:[{point_cd:'P0',lap:1,name:'출발',distance:'0.00'},{point_cd:'P4',lap:1,name:'5K',distance:'5.00'},{point_cd:'P13',lap:1,name:'도착',distance:'42.20'}]},{course_cd:'10K',distance:'10.000',points:[{point_cd:'P0',lap:1,name:'출발',distance:'0.00'},{point_cd:'P1',lap:1,name:'반환점',distance:'5.00'},{point_cd:'P3',lap:1,name:'도착',distance:'10.00'}]}]};
const event=parseTimingEvent(raw,'176'),start='2026-10-25T09:00:00+09:00',now=Date.parse('2026-10-25T14:00:00+09:00');
const player={event_id:176,course_cd:'Full',num:123,records:[{point_cd:'P0',lap:1,time_point:'09:02:00.000'},{point_cd:'P4',lap:1,time_point:'09:27:00.500'},{point_cd:'P13',lap:1,time_point:'12:32:00.000'}],name:'discard',mobile:'discard'};
test('source URL canonicalization only permits the verified provider and event paths',()=>{
 assert.equal(myResultSource('https://myresult.co.kr/api/event/176').url,'https://myresult.co.kr/176');
 for(const url of ['http://myresult.co.kr/176','https://127.0.0.1/176','https://myresult.co.kr.evil.test/176','https://u:p@myresult.co.kr/176','https://myresult.co.kr/176?q=x','https://myresult.co.kr/176#secret','https://myresult.co.kr:444/176','https://myresult.co.kr/api/event/176/player/1'])assert.throws(()=>myResultSource(url));
});
test('event and player normalization preserve course identity, actual start, fractional clock and official finish',()=>{
 assert.equal(event.courses[0].code,'Full');const records=parseTimingPlayer(player,event,'Full','00123','entry',42195,start,now);
 assert.equal(records.length,3);assert.equal(records[0].passedAt,'2026-10-25T00:02:00.000Z');assert.equal(records[1].passedAt,'2026-10-25T00:27:00.500Z');assert.equal(records[2].distanceMeters,42195);assert.equal(records[2].name,'FINISH');
 assert.equal(JSON.stringify(records).includes('mobile'),false);
});
test('foreign events, courses, BIBs and distances never enter a local runner',()=>{
 for(const override of [{event_id:132},{course_cd:'10K'},{num:124}])assert.throws(()=>parseTimingPlayer({...player,...override},event,'Full','123','entry',42195,start,now));
 assert.throws(()=>parseTimingPlayer(player,event,'Full','123','entry',10000,start,now));
 assert.throws(()=>parseTimingEvent({...raw,id:132},'176'));
 assert.throws(()=>parseTimingPlayer({...player,num:null},event,'Full','null','entry',42195,start,now));
});
test('unknown, future, malformed and earlier-than-start observations are ignored',()=>{
 const p={...player,records:[{point_cd:'P4',lap:1,time_point:'08:00:00'},{point_cd:'P4',lap:1,time_point:'25:00:00'},{point_cd:'unknown',lap:1,time_point:'09:25:00'},{point_cd:'P13',lap:1,time_point:'15:00:00'}]};
 assert.deepEqual(parseTimingPlayer(p,event,'Full','123','entry',42195,start,now),[]);
});
test('provider transport does not follow redirects and converts authorization failures without leaking bodies',async()=>{
 let called=0;
 const request:typeof fetch=async(_url,init)=>{called++;assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');return new Response(JSON.stringify({secret:'never expose'}),{status:401,headers:{'content-type':'application/json'}});};
 await assert.rejects(()=>fetchTimingJSON('https://myresult.co.kr/api/event/176/player/123',{},request),e=>e instanceof Error&&e.message.includes('인증')&&!e.message.includes('secret'));
 await assert.rejects(()=>fetchTimingJSON('https://evil.test/api/event/176',{},request));assert.equal(called,1);
 const valid:typeof fetch=async()=>new Response(JSON.stringify(raw),{headers:{'content-type':'application/json'}});
 assert.deepEqual(await fetchTimingJSON('https://myresult.co.kr/api/event/176',{},valid),raw);
 const big:typeof fetch=async()=>new Response('x'.repeat(1000001),{headers:{'content-type':'application/json'}});
 await assert.rejects(()=>fetchTimingJSON('https://myresult.co.kr/api/event/176',{},big));
});
test('API credentials require an explicit documented header and support per-event key selection',()=>{
 const names=['MYRESULT_API_KEY','MYRESULT_API_KEY_176','MYRESULT_API_KEY_HEADER'] as const;
 const original=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{for(const k of names)delete process.env[k];assert.equal(timingCredentials('176'),null);process.env.MYRESULT_API_KEY='fixture-only';assert.equal(timingCredentials('176'),null);process.env.MYRESULT_API_KEY_HEADER='X-Fixture-Key';process.env.MYRESULT_API_KEY_176='event-fixture';assert.deepEqual(timingCredentials('176'),{'X-Fixture-Key':'event-fixture'});process.env.MYRESULT_API_KEY_HEADER='Invalid\r\n';assert.equal(timingCredentials('176'),null);}
 finally{for(const k of names){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}}
});
