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


import {fetchPublicTimingHTML,parsePublicTimingPlayer} from '../../src/lib/race-tracking/myresult-public';
const publicPage=(rows:string[][],bib='123',code='Full',date=event.date,title=event.name)=>'<div class="ant-card"><div class="ant-card-meta-title">'+title+'</div><div class="ant-card-meta-description">'+date+' (일) | 공지천</div></div><div class="card-player ant-card"><div class="ant-card-meta-description">남자 | #'+bib+'</div><span class="ant-avatar-string">'+code+'</span></div><div class="table-header"><div>구간명</div><div>통과시간</div><div>구간기록</div><div>누적기록</div></div>'+rows.map(c=>'<div class="table-row">'+c.map(t=>'<div>'+t+'</div>').join('')+'</div>').join('');
const observed=[['출발','09:02:00.000','-','-'],['5K','09:27:00.500','25:00','25:00'],['도착','12:32:00','-','-']];
const parsePage=(html:string)=>parsePublicTimingPlayer(html,event,'Full','00123','entry',42195,start,now);
test('course mismatches identify 10K and elite-full runners without importing foreign records',()=>{
 const extended=parseTimingEvent({...raw,courses:[...raw.courses,{...raw.courses[0],course_cd:'EF',explain:'엘리트 풀코스'}]},'176');
 for(const code of ['10K','EF']){
  assert.throws(()=>parsePublicTimingPlayer(publicPage([['출발','09:02:00','-','-']],'123',code),extended,'Full','123','entry',42195,start,now),(error:unknown)=>{
   const e=error as {code:string;courseCode:string;message:string};
   assert.equal(e.code,'COURSE_MISMATCH');assert.equal(e.courseCode,code);assert.match(e.message,new RegExp(code));return true;
  });
 }
});
test('public SSR rows normalize into the same verified checkpoints without an API key',()=>{
 const records=parsePage(publicPage(observed));assert.equal(records.length,3);assert.equal(records[0].name,'START');assert.equal(records[1].passedAt,'2026-10-25T00:27:00.500Z');assert.equal(records[2].distanceMeters,42195);assert.equal(records[2].name,'FINISH');
 assert.deepEqual(records,parseTimingPlayer(player,event,'Full','00123','entry',42195,start,now));
});
test('public empty clocks and missing observations never manufacture starts or finishes',()=>{
 assert.deepEqual(parsePage(publicPage([['출발','?','-','-'],['5K','-','-','-'],['도착','','-','-']])),[]);
 assert.deepEqual(parsePage(publicPage([['출발','08:00:00','-','-'],['5K','15:00:00','-','-']])),[]);
});
test('public parser rejects mismatched identities, changed tables, ambiguous points and invalid clocks',()=>{
 for(const html of [publicPage(observed,'124'),publicPage(observed,'123','EF'),publicPage(observed,'123','Full','2025-10-25'),publicPage(observed,'123','Full',event.date,'다른 대회'),publicPage([]),publicPage([['5K','25:00:00','-','-']]),publicPage([['알수없음','09:25:00','-','-']]),publicPage([['출발','09:02:00']]),publicPage(observed).replace('통과시간','누적시간')])assert.throws(()=>parsePage(html));
 const duplicate={...event,courses:event.courses.map(c=>({...c,points:[...c.points,...c.points]}))};
 assert.throws(()=>parsePublicTimingPlayer(publicPage(observed),duplicate,'Full','123','entry',42195,start,now));
 // Script text does not participate in identity checks or table parsing.
 assert.throws(()=>parsePage('<script>'+publicPage(observed)+'</script>'));
});
test('10K public pages preserve course identity and use the official named turnaround distances',()=>{
 const e=parseTimingEvent({id:176,name:event.name,date:event.date,courses:[{course_cd:'10K',distance:'10',points:[{point_cd:'P0',lap:1,name:'출발',distance:'0'},{point_cd:'P1',lap:1,name:'1차 반환점',distance:'5'},{point_cd:'P2',lap:1,name:'2차 반환점',distance:'7'},{point_cd:'P3',lap:1,name:'도착',distance:'10'}]}]},'176');
 const html=publicPage([['출발','10:00:00','-','-'],['1차 반환점','10:30:00','-','-'],['2차 반환점','10:42:00','-','-'],['도착','11:00:00','-','-']],'123','10K');
 assert.deepEqual(parsePublicTimingPlayer(html,e,'10K','123','entry',10000,'2026-10-25T10:00:00+09:00',now).map(r=>r.distanceMeters),[0,5000,7000,10000]);
 assert.throws(()=>parsePage(html));
});
test('public transport restricts URLs, omits credentials, rejects redirects and limits payloads',async()=>{
 let calls=0;
 const request:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'https://myresult.co.kr/176/00123');assert.deepEqual(init?.headers,{Accept:'text/html'});assert.equal(init?.redirect,'error');return new Response(publicPage(observed),{headers:{'content-type':'text/html; charset=utf-8'}});};
 assert.equal(await fetchPublicTimingHTML('https://myresult.co.kr/176','00123',request),publicPage(observed));
 await assert.rejects(()=>fetchPublicTimingHTML('https://evil.test/176','00123',request));await assert.rejects(()=>fetchPublicTimingHTML('https://myresult.co.kr/176','../123',request));assert.equal(calls,1);
 for(const status of [401,403,429,500,302])await assert.rejects(()=>fetchPublicTimingHTML('https://myresult.co.kr/176','123',async()=>new Response('not shown',{status})));
 await assert.rejects(()=>fetchPublicTimingHTML('https://myresult.co.kr/176','123',async()=>new Response('{}',{headers:{'content-type':'application/json'}})));
 await assert.rejects(()=>fetchPublicTimingHTML('https://myresult.co.kr/176','123',async()=>new Response('x'.repeat(2000001),{headers:{'content-type':'text/html'}})));
});
