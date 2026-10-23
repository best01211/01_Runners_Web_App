"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {LiveTrackingView} from "./live-tracking-view";
import {buildCourse,positionAtDistance} from "@/lib/race-tracking/course";
import {trackRunner} from "@/lib/race-tracking/engine";
import {DEMO_COURSE,DEMO_DURATION_SECONDS,DEMO_START,MockTimingProvider} from "@/lib/race-tracking/providers/mock";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
const provider=new MockTimingProvider();
export function formatDuration(seconds:number|null){if(seconds===null)return "—";const n=Math.max(0,Math.round(seconds));return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
const tenK=buildCourse([...DEMO_COURSE.points.filter((_,i)=>DEMO_COURSE.cumulativeMeters[i]/DEMO_COURSE.measuredMeters*DEMO_COURSE.distanceMeters<10000),positionAtDistance(DEMO_COURSE,10000)],10000);
export function TrackingDemo({eventTitle}:{eventTitle?:string}){
 const[elapsed,setElapsed]=useState(15*60),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(10),[selected,setSelected]=useState("mock-1"),[short,setShort]=useState(false);
 const elapsedRef=useRef(elapsed);
 useEffect(()=>{elapsedRef.current=elapsed;},[elapsed]);
 useEffect(()=>{if(!playing)return;const base=elapsedRef.current,at=performance.now();const timer=setInterval(()=>setElapsed(Math.min(DEMO_DURATION_SECONDS,base+(performance.now()-at)/1000*speed)),1000);return()=>clearInterval(timer);},[playing,speed]);
 const course=short?tenK:DEMO_COURSE,now=DEMO_START+elapsed*1000;
 const data=useMemo<RaceSnapshot>(()=>{
  const runners=provider.getRunners(now).map((r,i)=>({...r,groupName:i%2?"B그룹":"A그룹",groupPaceSeconds:i%2?360:330,useGroupPrediction:true}));
  return {serverNow:new Date(now).toISOString(),title:eventTitle??"가상 대회",currentUserId:"demo",canManage:false,courseLocked:true,course:{name:short?"10K":"하프",points:course.points,distanceMeters:course.distanceMeters,startAt:new Date(DEMO_START).toISOString()},runners,checkpoints:Object.fromEntries(runners.map(r=>[r.id,provider.getCheckpoints(r.bib,now).filter(c=>c.distanceMeters<=course.distanceMeters).map(c=>({...c,name:c.distanceMeters===course.distanceMeters?"FINISH":c.name}))])),participants:[],entries:[]};
 },[now,short,course,eventTitle]);
 const states=useMemo(()=>data.runners.map(r=>trackRunner(r,data.checkpoints[r.id],course,now)),[data,course,now]);
 return <div className="mt-6 space-y-5"><header className="border-b border-zinc-200 pb-4"><p className="text-xs font-semibold text-zinc-500">DEMO · 실제 기록에 저장되지 않습니다</p><h1 className="mt-2 text-2xl font-bold">{eventTitle??"대회 추적 체험"}</h1><p className="mt-2 text-xs leading-5 text-zinc-500">서울레이스 GPX를 활용한 가상 코스·선수·계측입니다. 10K는 체험용으로 경로를 잘라 만든 종목이며 실제 대회 코스가 아닙니다.</p></header>
  <section aria-label="데모 재생 제어" className="space-y-3 rounded-xl border border-zinc-200 p-4"><div className="flex flex-wrap items-center gap-2"><button aria-pressed={!short} onClick={()=>setShort(false)} className={`min-h-11 rounded-xl border px-4 text-sm ${!short?"bg-[#22261f] text-white":""}`}>하프</button><button aria-pressed={short} onClick={()=>setShort(true)} className={`min-h-11 rounded-xl border px-4 text-sm ${short?"bg-[#22261f] text-white":""}`}>10K</button><button className="min-h-11 rounded-xl border px-4 text-sm" onClick={()=>setPlaying(!playing)}>{playing?"일시정지":"재생"}</button><button className="min-h-11 rounded-xl border px-4 text-sm" onClick={()=>{setElapsed(0);setPlaying(false);}}>처음으로</button><label className="text-sm">속도 <select aria-label="재생 속도" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,10,60].map(n=><option key={n} value={n}>{n}배</option>)}</select></label></div><label className="block text-xs">가상 시각 {new Date(now).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})} · 출발 후 {formatDuration(elapsed)}<input aria-label="가상 대회 진행 시각" type="range" min={0} max={DEMO_DURATION_SECONDS} step={30} value={elapsed} onChange={e=>{setElapsed(Number(e.target.value));setPlaying(false);}} className="mt-3 w-full accent-[#22261f]"/></label></section>
  <LiveTrackingView key={String(short)} data={data} course={course} states={states} selectedId={selected} onSelect={setSelected} now={now}/>
 </div>;
}
