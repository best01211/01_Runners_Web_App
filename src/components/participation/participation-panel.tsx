"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Participation = { participation_id:string; status:string; participation_locked:boolean } | null;
type Props = { scheduleId:string; scheduleStatus:string; participantCount:number; capacity:number|null; registrationStartAt:string|null; registrationEndAt:string; cancellationDeadlineAt:string|null; participation:Participation; canParticipate:boolean };

export function ParticipationPanel(props:Props){
  const router=useRouter();
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const now=Date.now();
  const started=!props.registrationStartAt || now>=new Date(props.registrationStartAt).getTime();
  const open=props.scheduleStatus==="open" && started && now<=new Date(props.registrationEndAt).getTime();
  const full=props.capacity!==null && props.participantCount>=props.capacity;

  async function register(){
    setLoading(true); setMessage("");
    try{
      const r=await fetch(`/api/schedules/${props.scheduleId}/participation`,{method:"POST"});
      const j=await r.json();
      if(!r.ok){ setMessage(j.error?.message??"참가 신청에 실패했습니다."); return; }
      router.refresh();
    }catch{ setMessage("서버와 통신하지 못했습니다."); }
    finally{ setLoading(false); }
  }

  async function cancel(){
    const reason=window.prompt("참가 취소 사유가 있다면 입력해 주세요.")??"";
    if(!window.confirm("참가 신청을 취소하시겠습니까?")) return;
    setLoading(true); setMessage("");
    try{
      const r=await fetch(`/api/schedules/${props.scheduleId}/participation`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})});
      const j=await r.json();
      if(!r.ok){ setMessage(j.error?.message??"참가 취소에 실패했습니다."); return; }
      router.refresh();
    }catch{ setMessage("서버와 통신하지 못했습니다."); }
    finally{ setLoading(false); }
  }

  return <section className="mt-8 rounded-2xl border border-zinc-200 p-6">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="text-xl font-bold">참가</h2><p className="mt-2 text-zinc-600">현재 {props.participantCount}명 참가{props.capacity!==null?` / 정원 ${props.capacity}명`:""}</p></div>
      {full&&!props.participation&&<span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">마감</span>}
    </div>
    {!props.participation ? <button type="button" onClick={register} disabled={loading||!props.canParticipate||!open||full} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:bg-zinc-300">
      {loading?"처리 중...":!props.canParticipate?"참가할 수 없는 계정입니다":!started?"신청 기간 전입니다":!open?"참가 신청 마감":full?"정원 마감":"참가하기"}
    </button> : <div className="mt-6 space-y-3">
      <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800">참가 신청 완료 · 상태: {props.participation.status}</div>
      <button type="button" onClick={cancel} disabled={loading||props.participation.participation_locked||(props.cancellationDeadlineAt!==null&&now>new Date(props.cancellationDeadlineAt).getTime())} className="w-full rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-700 disabled:opacity-50">참가 취소</button>
    </div>}
    {message&&<p className="mt-4 text-sm text-red-600">{message}</p>}
  </section>;
}
