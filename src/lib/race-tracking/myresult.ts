export type TimingCourse={code:string;name:string;distanceMeters:number;points:{code:string;lap:number;name:string;distanceMeters:number}[]};
export type TimingEvent={id:string;name:string;date:string;courses:TimingCourse[]};
export class TimingError extends Error {constructor(public code:string,message:string,public courseCode?:string){super(message);}}
export function myResultSource(value:string){
 let url:URL;try{url=new URL(value.trim());}catch{throw new TimingError('INVALID_SOURCE','MyResult 대회 주소를 확인해주세요.');}
 const match=url.pathname.match(/^\/(?:api\/event\/)?([1-9]\d{0,8})\/?$/);
 if(url.protocol!=='https:'||url.hostname!=='myresult.co.kr'||url.port||url.username||url.password||url.search||url.hash||!match)throw new TimingError('INVALID_SOURCE','현재 https://myresult.co.kr/대회번호 형식만 지원합니다.');
 return {id:match[1],url:`https://myresult.co.kr/${match[1]}`,api:`https://myresult.co.kr/api/event/${match[1]}`};
}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new TimingError('INVALID_RESPONSE','기록 제공처의 응답 형식이 변경되었습니다.');return v as Record<string,unknown>;};
const decimal=(v:unknown)=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;
export function parseTimingEvent(value:unknown,id:string):TimingEvent{
 const e=object(value);
 if(String(e.id)!==id||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(`${e.date}T00:00:00+09:00`))||!Array.isArray(e.courses)||e.courses.length>50)throw new TimingError('INVALID_RESPONSE','대회 정보 응답을 확인할 수 없습니다.');
 return {id,name:typeof e.name==='string'?e.name.slice(0,100):id,date:e.date,courses:e.courses.map(raw=>{
  const c=object(raw);const distance=decimal(c.distance)*1000;
  if(typeof c.course_cd!=='string'||!c.course_cd.match(/^[A-Za-z0-9_-]{1,40}$/)||!Number.isFinite(distance)||distance<1000||distance>100000||!Array.isArray(c.points)||c.points.length>100)throw new TimingError('INVALID_RESPONSE','종목 정보 응답을 확인할 수 없습니다.');
  return {code:c.course_cd,name:typeof c.explain==='string'&&c.explain?c.explain:typeof c.name==='string'&&c.name?c.name:c.course_cd,distanceMeters:distance,points:c.points.map(raw=>{const p=object(raw),d=decimal(p.distance)*1000;
   if(typeof p.point_cd!=='string'||!Number.isFinite(d)||d<0||!Number.isInteger(p.lap))throw new TimingError('INVALID_RESPONSE','계측소 정보가 올바르지 않습니다.');
   return {code:p.point_cd,lap:p.lap as number,name:typeof p.name==='string'?p.name.slice(0,40):p.point_cd,distanceMeters:d};
  })};
 })};
}
export function parseTimingPlayer(value:unknown,event:TimingEvent,code:string,bib:string,entryId:string,officialDistance:number,startAt:string,now:number){
 const p=object(value),course=event.courses.find(c=>c.code===code);
 const canonical=(v:string)=>/^\d+$/.test(v)?v.replace(/^0+(?=\d)/,''):v;
 if(!course||String(p.event_id)!==event.id||p.course_cd!==code||!["string","number"].includes(typeof p.num)||!String(p.num).match(/^[A-Za-z0-9-]{1,20}$/)||canonical(String(p.num))!==canonical(bib)||!Array.isArray(p.records)||p.records.length>100)throw new TimingError('IDENTITY_MISMATCH','배번호의 대회·종목 또는 기록 형식을 확인해주세요.');
 if(Math.abs(course.distanceMeters-officialDistance)>50)throw new TimingError('COURSE_MISMATCH','공식 거리와 연결된 종목 거리가 다릅니다.');
 const maxDistance=Math.max(...course.points.map(p=>p.distanceMeters));
 const records:{entryId:string;name:string;distanceMeters:number;passedAt:string}[]=[];
 for(const raw of p.records){const r=object(raw),point=course.points.find(c=>c.code===r.point_cd&&c.lap===r.lap);if(!point||typeof r.time_point!=='string')continue;
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(r.time_point))continue;
  let d=point.distanceMeters;
  if(d===maxDistance&&/도착|finish/i.test(point.name)&&Math.abs(d-officialDistance)<=50)d=officialDistance;
  const at=Date.parse(`${event.date}T${r.time_point}+09:00`);
  if(!Number.isFinite(at)||at<Date.parse(startAt)||at>now||d>officialDistance)continue;
  records.push({entryId,name:d===0?'START':d===officialDistance?'FINISH':point.name,distanceMeters:d,passedAt:new Date(at).toISOString()});
 }
 return records.sort((a,b)=>a.distanceMeters-b.distanceMeters);
}
