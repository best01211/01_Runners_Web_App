"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {LiveTracking} from "./live-tracking";
import {buildCourse,positionAtDistance} from "@/lib/race-tracking/course";
import {DEMO_COURSE,DEMO_DURATION_SECONDS,DEMO_START,MockTimingProvider} from "@/lib/race-tracking/providers/mock";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
const provider=new MockTimingProvider();
export function formatDuration(seconds:number|null){if(seconds===null)return "—";const n=Math.max(0,Math.round(seconds));return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
const tenK=buildCourse([...DEMO_COURSE.points.filter((_,i)=>DEMO_COURSE.cumulativeMeters[i]/DEMO_COURSE.measuredMeters*DEMO_COURSE.distanceMeters<10000),positionAtDistance(DEMO_COURSE,10000)],10000);
export function TrackingDemo({eventTitle}:{eventTitle?:string}){
 const[elapsed,setElapsed]=useState(15*60),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(10),[short,setShort]=useState(false);
 const elapsedRef=useRef(elapsed);
 useEffect(()=>{elapsedRef.current=elapsed;},[elapsed]);
 useEffect(()=>{if(!playing)return;const base=elapsedRef.current,at=performance.now();const timer=setInterval(()=>setElapsed(Math.min(DEMO_DURATION_SECONDS,base+(performance.now()-at)/1000*speed)),1000);return()=>clearInterval(timer);},[playing,speed]);
 const course=short?tenK:DEMO_COURSE,now=DEMO_START+elapsed*1000;
 const courseInfo=useMemo(()=>({name:short?"10K":"하프",points:course.points,distanceMeters:course.distanceMeters,startAt:new Date(DEMO_START).toISOString()}),[short,course]);
 const data=useMemo<RaceSnapshot>(()=>{
  const runners=provider.getRunners(now).map((r,i)=>({...r,groupName:i%2?"B그룹":"A그룹",groupPaceSeconds:i%2?360:330,useGroupPrediction:true}));
  return {raceId:short?"demo-10k":"demo-half",courses:[{raceId:"demo-half",name:"하프",distanceMeters:DEMO_COURSE.distanceMeters,startAt:new Date(DEMO_START).toISOString()},{raceId:"demo-10k",name:"10K",distanceMeters:10000,startAt:new Date(DEMO_START).toISOString()}],serverNow:new Date(now).toISOString(),title:eventTitle??"가상 대회",currentUserId:"demo",canManage:false,courseLocked:true,course:courseInfo,runners,checkpoints:Object.fromEntries(runners.map(r=>[r.id,provider.getCheckpoints(r.bib,now).filter(c=>c.distanceMeters<=course.distanceMeters).map(c=>({...c,name:c.distanceMeters===course.distanceMeters?"FINISH":c.name}))])),participants:[],entries:[]};
 },[now,short,course,courseInfo,eventTitle]);
 return <div className="mt-4 space-y-4">
  <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6"><strong>DEMO · 실제 기록에 저장되지 않습니다</strong><p className="mt-1 text-xs text-zinc-500">실제 대회와 같은 화면으로 가상 선수·계측을 체험합니다. 재생 제어에서 가상 시각을 변경할 수 있습니다. 서울레이스 GPX를 활용하며, 10K는 체험용으로 자른 경로로 실제 대회 코스가 아닙니다.</p></aside>
  <LiveTracking scheduleId={data.raceId!} title={data.title} simulation={{snapshot:data,now,onCourseSelect:id=>setShort(id==="demo-10k"),controls:(
  <details className="tracking-demo-controls rounded-xl border border-zinc-200 p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">데모 재생 제어</summary><div aria-label="데모 재생 제어" className="mt-3 space-y-3"><div className="flex flex-wrap items-center gap-2"><button className="min-h-11 rounded-xl border px-4 text-sm" onClick={()=>setPlaying(!playing)}>{playing?"일시정지":"재생"}</button><button className="min-h-11 rounded-xl border px-4 text-sm" onClick={()=>{setElapsed(0);setPlaying(false);}}>처음으로</button><label className="text-sm">속도 <select aria-label="재생 속도" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,10,60].map(n=><option key={n} value={n}>{n}배</option>)}</select></label></div><label className="block text-xs">가상 시각 {new Date(now).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})} · 출발 후 {formatDuration(elapsed)}<input aria-label="가상 대회 진행 시각" type="range" min={0} max={DEMO_DURATION_SECONDS} step={30} value={elapsed} onChange={e=>{setElapsed(Number(e.target.value));setPlaying(false);}} className="mt-3 w-full accent-[#22261f]"/></label></div></details>
  )}}/>
 </div>;
}
