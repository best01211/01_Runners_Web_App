"use client";
import {useState} from 'react';
import type {RaceSnapshot} from '@/lib/race-tracking/live-types';
import type {TimingEvent} from '@/lib/race-tracking/myresult';
const input='mt-1 min-h-11 w-full rounded-xl border border-zinc-300 bg-white p-3 text-base';
export function TimingSourcePanel({raceId,timing,onSaved}:{raceId:string;timing:RaceSnapshot['timing'];onSaved:()=>Promise<void>}){
 const[url,setUrl]=useState(timing?.sourceUrl??''),[code,setCode]=useState(timing?.courseCode??''),[enabled,setEnabled]=useState(timing?.enabled??false);
 const[event,setEvent]=useState<TimingEvent|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function send(action:'inspect'|'save'){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const r=await fetch(`/api/tracking/${raceId}/source`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,url,code,enabled})});
   const result=await r.json();if(!r.ok||!result.success)throw new Error(result.error?.message??'자동 수집 설정을 확인하지 못했습니다.');
   if(action==='inspect'){setEvent(result.data.event);setMessage('대회와 종목을 확인했습니다. API 키 없이 공개 기록 페이지에서 수집합니다.');}
   else {setMessage('저장했습니다.');await onSaved();}
  }catch(e){setMessage(e instanceof Error?e.message:'자동 수집 설정을 확인하지 못했습니다.');}finally{setBusy(false);}
 }
 return <details className="rounded-2xl border border-zinc-200 p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">대회 기록 자동 수집 설정</summary><div className="mt-3 space-y-4">
  <p className="text-xs leading-5 text-zinc-500">대회 주소는 같은 대회의 모든 종목이 공유합니다. 현재 종목에 대응하는 제공처 종목 코드를 선택해주세요. GPX 경로는 교체하지 않습니다.</p>
  <label className="block text-sm">MyResult 대회 주소<input type="url" disabled={busy} value={url} onChange={e=>{setUrl(e.target.value);setEvent(null);setCode('');setEnabled(false);}} placeholder="https://myresult.co.kr/176" className={input}/></label>
  <button type="button" disabled={busy||!url} onClick={()=>void send('inspect')} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy?'확인 중…':'주소 확인 · 종목 불러오기'}</button>
  {event&&<p className="text-sm font-semibold">{event.name} · {event.date}</p>}
  <label className="block text-sm">현재 코스에 연결할 종목<select disabled={busy} value={code} onChange={e=>setCode(e.target.value)} className={input}><option value="">주소 확인 후 종목 선택</option>{!event&&code&&<option value={code}>{code}</option>}{event?.courses.map(c=><option key={c.code} value={c.code}>{c.name} · {c.code} · {c.distanceMeters/1000}km</option>)}</select></label>
  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>setEnabled(e.target.checked)}/>같은 대회 전체 종목의 자동 수집 사용</label>
  <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">API 키 없이 등록된 배번호의 공개 기록 페이지를 읽습니다. 추적 화면이 보일 때 수집하며, 공개 페이지 지연·차단·형식 변경 시 마지막 기록을 유지합니다.</p>
  {timing&&<p className="text-xs leading-5 text-zinc-500">{timing.lastSyncedAt?`최근 수집: ${new Date(timing.lastSyncedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`:'아직 수집한 기록이 없습니다.'} · {timing.message}</p>}
  {message&&<p role="status" className="rounded-xl bg-zinc-100 p-3 text-sm">{message}</p>}
  <button type="button" disabled={busy||!url||!code} onClick={()=>void send('save')} className="min-h-11 rounded-xl bg-[#22261f] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">자동 수집 설정 저장</button>
 </div></details>;
}
