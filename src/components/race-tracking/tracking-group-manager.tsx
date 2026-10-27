"use client";
import {useState,type FormEvent} from "react";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
import type {RaceWrite} from "@/lib/race-tracking/validation";
const input="mt-1 w-full min-w-0 rounded-xl border border-zinc-300 bg-white p-3 text-base";
const pace=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}/km`;
export function TrackingGroupManager({data,write}:{data:RaceSnapshot;write:(payload:RaceWrite)=>Promise<void>}) {
 const [courseId,setCourseId]=useState(data.raceId??""),[editing,setEditing]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const courses=data.courses?.length?data.courses:[{raceId:data.raceId!,name:data.course?.name??"현재 종목",distanceMeters:data.course?.distanceMeters??0,startAt:data.course?.startAt??""}];
 const course=courses.find(c=>c.raceId===courseId)??courses[0];
 const groups=data.allGroups??(data.groups??[]).map(g=>({...g,courseId:data.raceId!,courseName:data.course?.name??"",distanceMeters:data.course?.distanceMeters??0}));
 const visible=groups.filter(g=>g.courseId===course.raceId);
 const selected=visible.find(g=>g.groupId===editing);
 async function submit(event:FormEvent<HTMLFormElement>,edit=false){
  event.preventDefault();if(busy)return;const form=event.currentTarget,values=new FormData(form);
  if(edit&&!selected)return;
  if(edit&&!window.confirm(`${course.name} · ${selected!.name} 그룹을 수정할까요?\n이 그룹 선수의 초기 예측 페이스에 적용되며, 기존 계측 기록과 소속 종목은 유지됩니다.`))return;
  setBusy(true);setMessage("");
  try{const common={name:String(values.get("groupName")),paceSeconds:Number(values.get("minutes"))*60+Number(values.get("seconds")),courseId:course.raceId};
   await write(edit?{action:"group-edit",...common,groupId:selected!.groupId}:{action:"group",...common});
   setMessage(`${course.name} 그룹을 ${edit?"수정":"등록"}했습니다.`);setEditing("");if(!edit)form.reset();
  }catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");}finally{setBusy(false);}
 }
 const fields=(group?:{name:string;paceSeconds:number})=><><label className="block text-sm">그룹 이름<input required name="groupName" maxLength={40} defaultValue={group?.name??""} placeholder="예: B그룹" className={input}/></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">분/km<input required name="minutes" type="number" min={2} max={20} defaultValue={Math.floor((group?.paceSeconds??300)/60)} className={input}/></label><label className="text-sm">초<input required name="seconds" type="number" min={0} max={59} defaultValue={(group?.paceSeconds??300)%60} className={input}/></label></div></>;
 return <section aria-label="종목별 추적 그룹 관리" className="space-y-4 rounded-xl bg-zinc-50 p-4">
  <label className="block text-sm font-semibold">그룹을 관리할 종목<select disabled={busy} value={course.raceId} onChange={e=>{setCourseId(e.target.value);setEditing("");setMessage("");}} className={input}>{courses.map(c=><option key={c.raceId} value={c.raceId}>{c.name} · {c.distanceMeters/1000}km</option>)}</select></label>
  <p className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">선택 종목: {course.name} · {course.distanceMeters/1000}km</p>
  <form onSubmit={e=>void submit(e)} className="space-y-3"><h3 className="font-bold">그룹 평균 페이스 등록</h3><p className="text-xs leading-5 text-zinc-500">선택한 종목에 그룹을 등록합니다. 첫 5km 계측 전에는 그룹 페이스로 예측합니다.</p><fieldset disabled={busy} className="space-y-3">{fields()}<button className="button-primary">그룹 등록</button></fieldset></form>
  <section className="space-y-3 border-t pt-4" aria-label="선택 종목 그룹 목록"><h3 className="font-bold">{course.name} 그룹 · {visible.length}개</h3>{!visible.length&&<p className="text-sm text-zinc-500">이 종목에 등록된 그룹이 없습니다.</p>}{visible.map(g=><article key={g.groupId} className="rounded-xl border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><small className="block text-zinc-500">{course.name} · {course.distanceMeters/1000}km</small><strong>{g.name} · {pace(g.paceSeconds)}</strong></div><button type="button" disabled={busy} className="button-secondary" aria-label={`${course.name} ${g.name} 그룹 수정`} onClick={()=>{setEditing(editing===g.groupId?"":g.groupId);setMessage("");}}>{editing===g.groupId?"수정 닫기":"수정"}</button></div>{editing===g.groupId&&<form key={`${g.groupId}:${g.name}:${g.paceSeconds}`} aria-label={`${course.name} ${g.name} 그룹 수정 입력`} onSubmit={e=>void submit(e,true)} className="mt-4 space-y-3 border-t pt-3"><fieldset disabled={busy} className="space-y-3">{fields(g)}<p className="text-xs leading-5 text-zinc-500">그룹 이름과 초기 예측 페이스를 수정합니다. 소속 종목과 기존 계측 기록은 유지됩니다.</p><button className="button-primary">그룹 수정 저장</button></fieldset></form>}</article>)}</section>
  {message&&<p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
 </section>;
}
