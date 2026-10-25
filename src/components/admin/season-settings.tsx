"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";

export type Season={season_id:string;name:string;starts_on:string;ends_on:string;status:string;is_public:boolean;is_default:boolean};
const statuses:Record<string,string>={scheduled:'예정',active:'진행',closed:'종료',hidden:'숨김'};
export function SeasonSettings({seasons}:{seasons:Season[]}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[deletedIds,setDeletedIds]=useState<string[]>([]);
 async function remove(season:Season){
  if(busy)return;
  const note=season.status==='active'||season.is_default?'현재 또는 기본 집계 시즌입니다. 삭제 후 다른 시즌을 지정해야 할 수 있습니다.\n':'';
  if(!window.confirm('“'+season.name+'” 시즌을 삭제할까요?\n'+note+'시즌 설정만 삭제하며, 일정과 출석 기록은 유지됩니다. 삭제한 설정은 복구할 수 없습니다.'))return;
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/admin/seasons',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({seasonId:season.season_id,confirmation:'시즌 삭제'})});const j=await r.json();if(!r.ok||!j.success)throw Error(j.error?.message??'시즌을 삭제하지 못했습니다.');setDeletedIds(ids=>[...ids,season.season_id]);setMessage('시즌 삭제 완료: '+season.name);router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'서버에 연결하지 못했습니다.');}finally{setBusy(false);}
 }
 async function save(e:FormEvent<HTMLFormElement>,season:Season){
  e.preventDefault();if(busy)return;const form=e.currentTarget,f=new FormData(form);setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/admin/seasons',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({seasonId:season.season_id,name:f.get('name'),startsOn:f.get('startsOn'),endsOn:f.get('endsOn'),status:f.get('status'),isPublic:f.get('isPublic')==='on',makeCurrent:f.get('makeCurrent')==='on'})});
   const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'시즌 저장에 실패했습니다.');
   setMessage(`${season.name} 설정을 저장했습니다.`);const current=form.elements.namedItem('makeCurrent') as HTMLInputElement|null;if(current)current.checked=false;router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'서버에 연결하지 못했습니다.');}finally{setBusy(false);}
 }
 return <div className="space-y-4">
  <p className="text-sm text-zinc-600">시즌을 펼치면 설정을 수정할 수 있습니다. 현재 시즌은 공개·진행 상태이며 오늘이 기간에 포함되어야 합니다. ‘현재 시즌으로 지정’을 선택하면 다른 진행 시즌은 예정으로 바뀝니다.</p>
  {message&&<p role="status" className="text-sm">{message}</p>}
  {!seasons.filter(s=>!deletedIds.includes(s.season_id)).length&&<p className="py-6 text-sm text-zinc-500">등록된 시즌이 없습니다. 위에서 새 시즌을 만들어주세요.</p>}
  {seasons.filter(s=>!deletedIds.includes(s.season_id)).map(s=><details key={s.season_id} className="rounded-2xl border border-zinc-200 bg-white p-4">
   <summary className="min-h-11 cursor-pointer [overflow-wrap:anywhere]"><strong>{s.name}</strong><span className="ml-2 text-xs text-zinc-600">{statuses[s.status]??s.status} · {s.is_public?'공개':'비공개'}</span><span className="mt-2 block text-sm text-zinc-500">{s.starts_on} ~ {s.ends_on}</span></summary>
   <form key={`${s.name}-${s.starts_on}-${s.ends_on}-${s.status}-${s.is_public}`} onSubmit={e=>void save(e,s)} className="mt-4 border-t border-zinc-100 pt-4"><fieldset disabled={busy} className="space-y-3">
    <label className="block text-sm">시즌명<input name="name" defaultValue={s.name} required maxLength={100} className="input mt-1"/></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm">시작일<input type="date" name="startsOn" defaultValue={s.starts_on} required className="input mt-1"/></label><label className="min-w-0 text-sm">종료일<input type="date" name="endsOn" defaultValue={s.ends_on} required className="input mt-1"/></label></div>
    <label className="block text-sm">상태<select name="status" defaultValue={s.status} className="input mt-1"><option value="scheduled">예정</option><option value="active">진행</option><option value="closed">종료</option><option value="hidden">숨김</option></select></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="isPublic" defaultChecked={s.is_public}/>회원에게 공개</label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="makeCurrent"/>현재 시즌으로 지정</label>
    <button className="button-primary">{busy?'처리 중…':'변경 사항 저장'}</button>
   </fieldset></form><div className="mt-5 border-t border-red-100 pt-4"><p className="mb-3 text-xs text-zinc-500">시즌 설정만 삭제합니다. 일정과 출석 기록은 유지됩니다.</p><button type="button" disabled={busy} className="button-secondary text-red-700" onClick={()=>void remove(s)}>시즌 삭제</button></div>
  </details>)}
 </div>;
}
