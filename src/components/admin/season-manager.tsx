"use client";
import {FormEvent,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {SeasonSettings,type Season} from './season-settings';

export function SeasonManager({seasons}:{seasons:Season[]}){
 const router=useRouter(),creation=useRef<HTMLDetailsElement>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;const form=e.currentTarget,f=new FormData(form);setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/admin/seasons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),startsOn:f.get('startsOn'),endsOn:f.get('endsOn'),status:f.get('status'),isPublic:f.get('isPublic')==='on',isDefault:f.get('isDefault')==='on'})});
   const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'시즌 생성에 실패했습니다.');
   setMessage('시즌이 생성되었습니다. 아래 목록에서 기간과 공개 여부를 수정할 수 있습니다.');form.reset();if(creation.current)creation.current.open=false;router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:'서버와 통신하지 못했습니다.');}finally{setBusy(false);}
 }
 return <div className="space-y-6">
  <p className="text-sm text-zinc-600">새 시즌을 만들고, 시즌별 기간·공개 여부·현재 시즌을 한곳에서 관리합니다.</p>
  <details ref={creation} className="rounded-2xl border border-zinc-200 bg-white p-4"><summary className="min-h-11 cursor-pointer content-center font-bold">새 시즌 만들기</summary>
   <form onSubmit={submit} className="mt-4"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
    <label className="min-w-0 text-sm sm:col-span-2">시즌명<input name="name" required maxLength={100} className="input mt-1" placeholder="예: 2026 가을 시즌"/></label>
    <label className="min-w-0 text-sm">시작일<input name="startsOn" type="date" required className="input mt-1"/></label>
    <label className="min-w-0 text-sm">종료일<input name="endsOn" type="date" required className="input mt-1"/></label>
    <label className="text-sm sm:col-span-2">상태<select name="status" className="input mt-1"><option value="scheduled">예정</option><option value="active">진행</option><option value="closed">종료</option><option value="hidden">숨김</option></select></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input name="isPublic" type="checkbox" defaultChecked/> 회원에게 공개</label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input name="isDefault" type="checkbox"/> 기본 집계 시즌</label>
    <p className="text-xs text-zinc-500 sm:col-span-2">기본 집계 시즌은 현재 시즌 지정과 별개입니다. 현재 시즌은 생성 후 아래 목록에서 지정할 수 있습니다.</p>
    <button disabled={busy} className="button-primary sm:col-span-2">{busy?'생성 중…':'시즌 생성'}</button>
   </fieldset></form>
  </details>
  {message&&<p role="status" className="text-sm">{message}</p>}
  <section><h3 className="mb-3 font-bold">시즌 목록 <span className="text-zinc-500">{seasons.length}개</span></h3><SeasonSettings seasons={seasons}/></section>
 </div>;
}
