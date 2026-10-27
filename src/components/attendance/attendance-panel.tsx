/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";
import {useScheduleStarted} from "@/lib/use-schedule-started";
import { FormEvent, useEffect, useState, useRef } from "react";
import {participationGroupLabel,type ParticipationGroup} from "@/lib/participation-groups";
type Row = { user_id: string; status: string; pace_group_id?:string|null; profiles?: { name: string } | null };
export type AttendanceSnapshot={attendance:Row[];attendanceOpen:boolean;attendanceClosed:boolean;attendanceCode?:string};
const labels: Record<string, string> = { not_checked: "미확인", attended: "출석", late: "지각", absent: "불참" };
export function AttendancePanel({ startAt, scheduleId, canManage,paceGroups=[],eventMode=false,initialData }: { startAt:string;initialData?:AttendanceSnapshot;scheduleId: string; canManage: boolean;eventMode?:boolean;paceGroups?:ParticipationGroup[] }) {
  const started=useScheduleStarted(startAt);
  const closeDialog=useRef<HTMLDialogElement>(null);
  const [search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("all"),[closeRows,setCloseRows]=useState<Row[]>([]);

  const [rosterOpen,setRosterOpen]=useState(false);
  const [loaded,setLoaded]=useState(Boolean(initialData));
  const [rows,setRows]=useState<Row[]>(initialData?.attendance??[]),[open,setOpen]=useState(initialData?.attendanceOpen??false),[closed,setClosed]=useState(initialData?.attendanceClosed??false),[code,setCode]=useState(initialData?.attendanceCode??""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{if(initialData){setRows(initialData.attendance);setOpen(initialData.attendanceOpen);setClosed(initialData.attendanceClosed);setCode(initialData.attendanceCode??"");setLoaded(true);}},[initialData]);
  async function load() {
    try {
      const response=await fetch('/api/schedules/'+scheduleId+'/attendance');
      const result=await response.json();
      if(!response.ok) throw new Error(result.error?.message ?? "출석을 불러오지 못했습니다.");
      setRows(result.data.attendance);setOpen(result.data.attendanceOpen);setClosed(result.data.attendanceClosed);setCode(result.data.attendanceCode ?? "");setLoaded(true);return result.data as AttendanceSnapshot;
    } catch(error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다.");return null; }
  }
  useEffect(()=>{if(!initialData)void load();const timer=setInterval(()=>{void load()},15000);return()=>clearInterval(timer)},[scheduleId]);
  async function act(body: object,method="POST") {
    if(busy||!started) return;
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
  async function previewClose() {
    if(busy)return;setBusy(true);setMessage("");
    try{const latest=await load();if(!latest)return;
      if(!latest.attendanceOpen||latest.attendanceClosed){setMessage("이미 출석이 종료되었거나 출석 중인 일정이 아닙니다.");return;}
      setCloseRows(latest.attendance.filter(row=>row.status==="not_checked"));closeDialog.current?.showModal();
    }finally{setBusy(false);}
  }
  const counts=Object.fromEntries(Object.keys(labels).map(status=>[status,rows.filter(row=>row.status===status).length]));
  const visibleRows=rows.filter(row=>(statusFilter==="all"||row.status===statusFilter)&&(row.profiles?.name??"회원").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function check(event:FormEvent<HTMLFormElement>){event.preventDefault();void act({action:"check",code:new FormData(event.currentTarget).get("code")})}
  return <section id="attendance" style={{scrollMarginTop:100}} className="attendance-card mt-8 rounded-2xl border p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">출석</h2>{canManage&&<button type="button" className="button-secondary" onClick={()=>setRosterOpen(value=>!value)} aria-expanded={rosterOpen}>{rosterOpen?"명단 닫기":"출석 · 참가 명단"}</button>}</div>
    {!started&&<p className="mt-4 text-sm text-zinc-500">일정 시작 시각부터 출석할 수 있습니다.</p>}
    {loaded&&started&&!open&&!closed&&!canManage&&<p className="mt-3 text-sm">운영진이 출석을 열기를 기다리고 있어요. 출석이 열리면 현장 운영진에게 받은 4자리 번호를 입력해주세요.</p>}
    {open&&!closed&&!canManage&&<p className="mt-3 text-sm">현장 운영진에게 받은 4자리 출석번호를 입력하고 인증을 눌러주세요. 신청 완료와 출석 인증은 별도입니다.</p>}
    {loaded&&!canManage&&!rows.length&&<p className="mt-3 text-sm">참가 신청 여부를 먼저 확인해주세요. 신청했는데 기록이 없다면 현장 운영진에게 알려주세요.</p>}
    {!loaded&&<p role="status" className="mt-4 min-h-11 text-sm text-zinc-500">출석 정보를 불러오고 있습니다…</p>}
    {loaded&&canManage&&<div className="mt-4 flex flex-wrap gap-2">{closed?<span>출석 종료됨</span>:!open?<button disabled={busy||!started} onClick={()=>act({action:"open"})} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">출석 시작</button>:<><span className="rounded-xl bg-amber-50 px-4 py-2 font-black">번호 {code}</span><button disabled={busy||!started} onClick={()=>void previewClose()} className="rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white">출석 종료</button></>}</div>}
    {loaded&&canManage&&<div className="attendance-summary mt-4" aria-label="전체 참가자 출석 요약"><button type="button" aria-pressed={statusFilter==="all"} onClick={()=>{setStatusFilter("all");setRosterOpen(true);}}>전체 {rows.length}명</button>{Object.entries(labels).map(([status,label])=><button type="button" key={status} aria-pressed={statusFilter===status} onClick={()=>{setStatusFilter(status);setRosterOpen(true);}}>{label} {counts[status]}명</button>)}</div>}
    {loaded&&!canManage&&<p className="mt-4" aria-live="polite">내 출석: {rows[0]?labels[rows[0].status] ?? rows[0].status:"출석 기록 없음"}{closed&&" · 출석 종료"}</p>}
    {open&&!canManage&&rows[0]?.status==="not_checked"&&<form onSubmit={check} className="mt-4 flex gap-2"><input required name="code" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} aria-label="4자리 출석번호" autoComplete="off" className="input attendance-code-input min-w-0 flex-1" placeholder="4자리 출석번호"/><button disabled={busy||!started} className="min-h-11 min-w-16 shrink-0 whitespace-nowrap rounded-xl bg-emerald-600 px-4 font-bold text-white">인증</button></form>}
    {loaded&&canManage&&rosterOpen&&<div className="participant-roster"><div className="attendance-roster-filters"><label>참가자 이름 검색<input type="search" className="input mt-1" placeholder="이름으로 찾기" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>출석 상태<select className="input mt-1" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">전체</option>{Object.entries(labels).map(([status,label])=><option key={status} value={status}>{label}</option>)}</select></label></div><p role="status" className="my-3 text-sm">검색 결과 {visibleRows.length}명 / 전체 {rows.length}명</p><p className="mb-3 text-sm text-zinc-600">{eventMode?'이벤트 참석자':'그룹별 참가자'} {rows.length}명 · 출석 시작 후 상태를 선택할 수 있습니다.</p>{[...paceGroups.map(g=>({id:g.pace_group_id,label:participationGroupLabel(g)})),{id:'none',label:eventMode?'이벤트 참석자':'그룹 미지정'}].map(group=>{const members=visibleRows.filter(row=>(row.pace_group_id??'none')===group.id);if(!members.length)return null;return <section key={group.id} className="mb-4"><h3 className="font-semibold">{group.label} · {members.length}명</h3>{members.map(row=><div key={row.user_id} className="roster-row"><span>{row.profiles?.name??'회원'}</span><label><span className="sr-only">{row.profiles?.name??'회원'} 출석 상태</span><select disabled={busy||!started||(!open&&!closed)} value={row.status} onChange={event=>act({userId:row.user_id,status:event.target.value},'PATCH')} className="input">{Object.entries(labels).filter(([value])=>!closed||value!=='not_checked').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>)}</section>})}{!visibleRows.length&&<p className="text-sm text-zinc-600">{rows.length?"검색 조건에 맞는 참가자가 없습니다.":"참가 신청자가 없습니다."}</p>}</div>}
    {canManage&&<dialog ref={closeDialog} aria-labelledby="attendance-close-title" className="attendance-close-dialog"><h3 id="attendance-close-title" className="text-lg font-bold">출석을 종료할까요?</h3><p className="mt-3">미확인 <strong>{closeRows.length}명</strong>이 불참 처리됩니다.</p><p className="mt-2 text-sm text-zinc-600">검색·필터와 관계없이 종료 버튼을 누를 때 다시 조회한 전체 명단입니다.</p>{closeRows.length>0?<ul className="attendance-close-list">{closeRows.map(row=><li key={row.user_id}>{row.profiles?.name??"회원"} · {paceGroups.find(g=>g.pace_group_id===row.pace_group_id)?participationGroupLabel(paceGroups.find(g=>g.pace_group_id===row.pace_group_id)!):eventMode?"이벤트 참석자":"그룹 미지정"}</li>)}</ul>:<p className="mt-3 text-sm">미확인 참가자가 없습니다.</p>}<p className="mt-3 text-sm text-zinc-600">확인 중 다른 회원이 인증하면 실제 불참 인원은 줄어들 수 있습니다.</p><div className="staff-group-actions mt-5"><button type="button" className="button-secondary" onClick={()=>closeDialog.current?.close()}>계속 확인</button><button type="button" disabled={busy||!open||closed} className="button-primary" onClick={()=>{closeDialog.current?.close();void act({action:"close"},"PATCH");}}>출석 종료 확정</button></div></dialog>}
    {message&&<p role="status" className="mt-3 text-sm text-zinc-600">{message}</p>}
  </section>;
}
