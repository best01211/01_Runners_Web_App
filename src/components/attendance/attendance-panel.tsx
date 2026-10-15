/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";
import { FormEvent, useEffect, useState } from "react";
type Row = { user_id: string; status: string; pace_group_id?:string|null; profiles?: { name: string } | null };
const labels: Record<string, string> = { not_checked: "미확인", attended: "출석", late: "지각", absent: "불참" };
export function AttendancePanel({ scheduleId, canManage,paceGroups=[],eventMode=false }: { scheduleId: string; canManage: boolean;eventMode?:boolean;paceGroups?:{pace_group_id:string;pace_seconds:number;distance_km:number}[] }) {
  const [rosterOpen,setRosterOpen]=useState(false);
  const [rows,setRows]=useState<Row[]>([]),[open,setOpen]=useState(false),[closed,setClosed]=useState(false),[code,setCode]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function load() {
    try {
      const response=await fetch('/api/schedules/'+scheduleId+'/attendance');
      const result=await response.json();
      if(!response.ok) throw new Error(result.error?.message ?? "출석을 불러오지 못했습니다.");
      setRows(result.data.attendance);setOpen(result.data.attendanceOpen);setClosed(result.data.attendanceClosed);setCode(result.data.attendanceCode ?? "");
    } catch(error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
  }
  useEffect(()=>{void load();const timer=setInterval(()=>{void load()},15000);return()=>clearInterval(timer)},[scheduleId]);
  async function act(body: object,method="POST") {
    if(busy) return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch('/api/schedules/'+scheduleId+'/attendance',{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok) {
        const detail = result.error?.details;
        const diagnostic = detail?.databaseCode ? ` [${detail.databaseCode}] ${detail.databaseMessage ?? ""}` : "";
        throw new Error((result.error?.message ?? "처리에 실패했습니다.") + diagnostic);
      }
      setMessage("처리되었습니다.");await load();
    } catch(error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
    finally {setBusy(false)}
  }
  function check(event:FormEvent<HTMLFormElement>){event.preventDefault();void act({action:"check",code:new FormData(event.currentTarget).get("code")})}
  return <section className="attendance-card mt-8 rounded-2xl border p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">출석</h2>{canManage&&<button type="button" className="button-secondary" onClick={()=>setRosterOpen(value=>!value)} aria-expanded={rosterOpen}>{rosterOpen?"명단 닫기":"출석 · 참가 명단"}</button>}</div>
    {canManage&&<div className="mt-4 flex flex-wrap gap-2">{closed?<span>출석 종료됨</span>:!open?<button disabled={busy} onClick={()=>act({action:"open"})} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">출석 시작</button>:<><span className="rounded-xl bg-amber-50 px-4 py-2 font-black">번호 {code}</span><button disabled={busy} onClick={()=>{if(confirm("미확인 참가자는 불참으로 처리됩니다. 출석을 종료할까요?"))void act({action:"close"},"PATCH")}} className="rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white">출석 종료</button></>}</div>}
    {!canManage&&<p className="mt-4" aria-live="polite">내 출석: {rows[0]?labels[rows[0].status] ?? rows[0].status:"출석 기록 없음"}{closed&&" · 출석 종료"}</p>}
    {open&&!canManage&&rows[0]?.status==="not_checked"&&<form onSubmit={check} className="mt-4 flex gap-2"><input required name="code" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} aria-label="4자리 출석번호" autoComplete="off" className="input attendance-code-input" placeholder="4자리 출석번호"/><button disabled={busy} className="rounded-xl bg-emerald-600 px-4 font-bold text-white">인증</button></form>}
    {canManage&&rosterOpen&&<div className="participant-roster"><p className="mb-3 text-sm text-zinc-600">{eventMode?'이벤트 참석자':'그룹별 참가자'} {rows.length}명 · 출석 시작 후 상태를 선택할 수 있습니다.</p>{[...paceGroups.map(g=>({id:g.pace_group_id,label:`${Math.floor(g.pace_seconds/60)}:${String(g.pace_seconds%60).padStart(2,'0')} / ${g.distance_km}km`})),{id:'none',label:eventMode?'이벤트 참석자':'그룹 미지정'}].map(group=>{const members=rows.filter(row=>(row.pace_group_id??'none')===group.id);if(!members.length)return null;return <section key={group.id} className="mb-4"><h3 className="font-semibold">{group.label} · {members.length}명</h3>{members.map(row=><div key={row.user_id} className="roster-row"><span>{row.profiles?.name??'회원'}</span><label><span className="sr-only">{row.profiles?.name??'회원'} 출석 상태</span><select disabled={busy||(!open&&!closed)} value={row.status} onChange={event=>act({userId:row.user_id,status:event.target.value},'PATCH')} className="input">{Object.entries(labels).filter(([value])=>!closed||value!=='not_checked').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>)}</section>})}{!rows.length&&<p className="text-sm text-zinc-600">참가 신청자가 없습니다.</p>}</div>}
    {message&&<p role="status" className="mt-3 text-sm text-zinc-600">{message}</p>}
  </section>;
}
