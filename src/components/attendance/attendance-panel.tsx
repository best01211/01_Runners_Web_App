/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";
import { FormEvent, useEffect, useState } from "react";
type Row = { user_id: string; status: string; profiles?: { name: string } | null };
const labels: Record<string, string> = { not_checked: "미확인", attended: "출석", late: "지각", absent: "불참" };
export function AttendancePanel({ scheduleId, canManage }: { scheduleId: string; canManage: boolean }) {
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
      if(!response.ok) throw new Error(result.error?.message ?? "처리에 실패했습니다.");
      setMessage("처리되었습니다.");await load();
    } catch(error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
    finally {setBusy(false)}
  }
  function check(event:FormEvent<HTMLFormElement>){event.preventDefault();void act({action:"check",code:new FormData(event.currentTarget).get("code")})}
  return <section className="mt-8 rounded-2xl border p-6"><h2 className="text-xl font-bold">출석</h2>
    {canManage&&<div className="mt-4 flex flex-wrap gap-2">{closed?<span>출석 종료됨</span>:!open?<button disabled={busy} onClick={()=>act({action:"open"})} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">출석 시작</button>:<><span className="rounded-xl bg-amber-50 px-4 py-2 font-black">번호 {code}</span><button disabled={busy} onClick={()=>{if(confirm("미확인 참가자는 불참으로 처리됩니다. 출석을 종료할까요?"))void act({action:"close"},"PATCH")}} className="rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white">출석 종료</button></>}</div>}
    {!canManage&&<p className="mt-4" aria-live="polite">내 출석: {rows[0]?labels[rows[0].status] ?? rows[0].status:"출석 기록 없음"}{closed&&" · 출석 종료"}</p>}
    {open&&!canManage&&rows[0]?.status==="not_checked"&&<form onSubmit={check} className="mt-4 flex gap-2"><input required name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="input" placeholder="6자리 출석번호"/><button disabled={busy} className="rounded-xl bg-emerald-600 px-4 font-bold text-white">인증</button></form>}
    {canManage&&rows.length>0&&<div className="mt-4 space-y-2">{rows.map(row=><div key={row.user_id} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3"><span>{row.profiles?.name ?? row.user_id}</span><select disabled={busy} value={row.status} onChange={event=>act({userId:row.user_id,status:event.target.value},"PATCH")} className="rounded-lg border p-2">{Object.entries(labels).filter(([value])=>!closed||value!=="not_checked").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>)}</div>}
    {message&&<p role="status" className="mt-3 text-sm text-zinc-600">{message}</p>}
  </section>;
}
