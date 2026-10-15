'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
type Member={user_id:string;name:string;nickname:string|null;login_id:string};
type Participation={participation_id:string;event_role:string;participation_locked:boolean;pace_change_locked:boolean}|null;
type Schedule={event_kind:string;event_registration_locked:boolean;capacity:number|null;status:string;registration_start_at:string|null;registration_end_at:string;end_at:string|null;cancellation_deadline_at:string|null};
type Data={schedule:Schedule;participation:Participation;counts:Record<string,number>;roster?:{participation_id:string;event_role:string;profiles:Member|Member[]|null}[]};
const labels:Record<string,string>={runner:'주자',cheer:'응원단',attendee:'참석'};
export function EventParticipationPanel({scheduleId,canParticipate,canManage,maintenanceBlocked=false}:{scheduleId:string;canParticipate:boolean;canManage:boolean;maintenanceBlocked?:boolean}){
 const router=useRouter(),[data,setData]=useState<Data|null>(null),[choice,setChoice]=useState<string|null>(null),[now,setNow]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loadError,setLoadError]=useState('');
 const [name,setName]=useState(''),[matches,setMatches]=useState<Member[]>([]),[member,setMember]=useState<Member|null>(null),[manualRole,setManualRole]=useState('runner'),[searching,setSearching]=useState(false),[searched,setSearched]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch(`/api/schedules/${scheduleId}/event-participation`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'신청 정보를 불러오지 못했습니다.');setData(j.data);setChoice(c=>c??j.data.participation?.event_role??null);setNow(Date.now());setLoadError('');}catch(e){setLoadError(e instanceof Error?e.message:'조회에 실패했습니다.');}},[scheduleId]);
 // load updates state after the network response, rather than synchronously in the effect.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
 async function write(method:string,body:object){if(busy)return;
  if(method!=='DELETE'&&maintenanceBlocked){window.alert('현재 점검 중으로 참석 신청을 사용할 수 없습니다.');return;}
  setBusy(true);setMessage('');try{
   const endpoint=method==='DELETE'?'participation':'event-participation';
   const r=await fetch(`/api/schedules/${scheduleId}/${endpoint}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'신청을 저장하지 못했습니다.');
   setMessage(method==='DELETE'?'참석 신청을 취소했습니다.':'참석 신청을 저장했습니다.');setMember(null);setMatches([]);setSearched(false);await load();router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'저장에 실패했습니다.');await load();}finally{setBusy(false);}
 }
 async function search(e:FormEvent){e.preventDefault();if(searching)return;setSearching(true);setMember(null);setMatches([]);setSearched(false);setMessage('');
  try{const r=await fetch(`/api/schedules/${scheduleId}/event-participation?search=${encodeURIComponent(name.trim())}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'검색에 실패했습니다.');setMatches(j.data.members);setSearched(true);}catch(e){setMessage(e instanceof Error?e.message:'검색에 실패했습니다.');}finally{setSearching(false);}
 }
 if(!data)return <section className="event-participation-card mt-8 rounded-2xl border bg-white p-5"><h2 className="font-bold">이벤트 참석</h2><p role="status" className="mt-3">{loadError||'신청 정보를 불러오는 중…'}</p>{loadError&&<button className="button-secondary mt-3" onClick={()=>void load()}>다시 시도</button>}</section>;
 const s=data.schedule,saved=data.participation,race=s.event_kind==='race',total=Object.values(data.counts).reduce((a,b)=>a+b,0),full=!race&&s.capacity!==null&&total>=s.capacity;
 const started=!s.registration_start_at||now>=Date.parse(s.registration_start_at),open=s.status==='open'&&started&&now<=Date.parse(s.registration_end_at)&&(!s.end_at||now<Date.parse(s.end_at)),locked=!race&&s.event_registration_locked;
 const cancelLocked=saved?.participation_locked||(s.cancellation_deadline_at&&now>Date.parse(s.cancellation_deadline_at));
 const blockedReason=!canParticipate?'신규 신청이 제한된 계정입니다':!started?'모집 시작 전입니다':locked?'일반 모집 종료 · 운영진 추가만 가능':!open?'모집이 종료되었습니다':full?'정원이 마감되었습니다':!race&&s.capacity===null?'운영진의 정원 설정이 필요합니다':'';
 return <section className="event-participation-card mt-8 space-y-5 rounded-2xl border bg-white p-5"><header><h2 className="text-xl font-bold">{race?'대회 이벤트 참석':'행사 이벤트 참석'}</h2><p className="mt-2 text-sm text-zinc-600">현재 {total}명{race?' · 정원 제한 없음':s.capacity!==null?` / 정원 ${s.capacity}명`:''}</p></header>
 <div className="flex flex-wrap gap-2">{(race?['runner','cheer']:['attendee']).map(role=><span key={role} className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">{labels[role]} {data.counts[role]??0}명</span>)}</div>
 {saved&&<p className="text-sm font-semibold text-green-800">{labels[saved.event_role]??'참석'} 신청 완료</p>}
 {race&&<div className="pace-choice-grid" aria-label="대회 참석 유형">{['runner','cheer'].map(role=><button type="button" className="pace-choice" aria-pressed={choice===role} disabled={busy||(!saved&&Boolean(blockedReason))||Boolean(saved?.pace_change_locked)} key={role} onClick={()=>setChoice(role)}>{labels[role]}</button>)}</div>}
 {!saved?<button className="button-primary w-full" disabled={busy||Boolean(loadError)||Boolean(blockedReason)} onClick={()=>{if(race&&!choice){window.alert('주자 또는 응원단을 선택해주세요.');return;}void write('POST',{eventRole:race?choice:'attendee'});}}>{blockedReason||'참석 신청'}</button>:<div className="flex flex-wrap gap-2">{race&&<button className="button-primary" disabled={busy||Boolean(loadError)||!open||!canParticipate||Boolean(saved.pace_change_locked)||!choice||choice===saved.event_role} onClick={()=>void write('PATCH',{eventRole:choice})}>참석 유형 변경</button>}<button className="button-secondary" disabled={busy||Boolean(loadError)||Boolean(cancelLocked)} onClick={()=>void write('DELETE',{reason:'사용자 취소'})}>참석 취소</button></div>}
 {!race&&<p className="text-xs text-zinc-500">모집 시작부터 선착순입니다. 정원이 한 번 차면 취소로 빈자리가 생겨도 일반 신청은 다시 열리지 않습니다. 이후 빈자리 추가는 운영진에게 요청해주세요.</p>}
 {canManage&&<section className="space-y-3 border-t pt-5"><h3 className="font-bold">운영진 참석자 추가</h3><p className="text-xs text-zinc-500">모집 종료 후에도 회원을 추가할 수 있습니다.{!race&&' 남은 정원 안에서만 추가할 수 있습니다.'} 이름이 같은 경우 닉네임·아이디를 확인해주세요.</p>
 <form onSubmit={search} className="flex flex-wrap gap-2"><input aria-label="참석할 회원 이름" required maxLength={50} placeholder="회원 이름 검색" className="input min-w-0 flex-1" value={name} onChange={e=>{setName(e.target.value);setMember(null);setMatches([]);setSearched(false);}}/><button className="button-secondary" disabled={searching||busy}>{searching?'검색 중…':'이름 검색'}</button></form>
 {searched&&!matches.length&&<p className="text-sm text-zinc-500">일치하는 활성 회원이 없습니다.</p>}
 {matches.length>0&&<div className="space-y-2">{matches.map(m=><button type="button" key={m.user_id} aria-pressed={member?.user_id===m.user_id} onClick={()=>setMember(m)} className={`flex min-h-11 w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${member?.user_id===m.user_id?'border-zinc-900 bg-zinc-100':'bg-white'}`}><b>{m.name}</b><span>{m.nickname||'닉네임 없음'} · {m.login_id}</span>{member?.user_id===m.user_id&&<span>선택됨</span>}</button>)}</div>}
 {race&&<label className="block text-sm">추가할 참석 유형<select className="input mt-1" value={manualRole} onChange={e=>setManualRole(e.target.value)}><option value="runner">주자</option><option value="cheer">응원단</option></select></label>}
 <button className="button-primary" disabled={busy||!member||Boolean(loadError)||full||(!race&&s.capacity===null)} onClick={()=>member&&void write('POST',{eventRole:race?manualRole:'attendee',managerAdd:true,userId:member.user_id})}>{full?'정원이 가득 찼습니다':'선택한 회원 참석 추가'}</button>
 {data.roster&&<details><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">현재 신청자 명단 ({total}명)</summary><ul className="mt-2 space-y-2">{data.roster.map(row=>{const p=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;return <li key={row.participation_id} className="flex justify-between gap-2 border-b py-2 text-sm"><span>{p?.name??'탈퇴한 회원'}{p?.nickname?` · ${p.nickname}`:''}</span><span>{labels[row.event_role]??'참석'}</span></li>;})}</ul></details>}
 </section>}
 {loadError&&<p role="alert" className="text-sm text-red-600">{loadError}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
