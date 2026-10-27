"use client";
import dynamic from "next/dynamic";
import {useEffect,useMemo,useState} from "react";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
import {buildCourse} from "@/lib/race-tracking/course";
import {trackRunner} from "@/lib/race-tracking/engine";
import {trackingStatusLabel} from "@/lib/race-tracking/status-label";
import type {Course} from "@/lib/race-tracking/types";

const TrackingMap=dynamic(()=>import("./tracking-map"),{ssr:false,loading:()=> <p className="min-h-80 rounded-xl bg-zinc-100 p-5">지도 준비 중…</p>});
const colors=["#17465c","#c2410c","#7e22ce","#047857","#1d4ed8"];
export function AllCoursesOverview({data,now,simulationSnapshots,onOpen}:{data:RaceSnapshot;now:number;simulationSnapshots?:RaceSnapshot[];onOpen:(courseId:string,runnerId?:string)=>void}) {
 const [received,setReceived]=useState<RaceSnapshot[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0),[query,setQuery]=useState(""),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  if(simulationSnapshots)return;
  let alive=true;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  async function load(){setLoading(true);setError("");
   const results=await Promise.allSettled((data.courses??[]).filter(c=>c.raceId!==data.raceId).map(async c=>{
    const response=await fetch(`/api/tracking/${encodeURIComponent(c.raceId)}`,{cache:"no-store",signal:controller.signal});const result=await response.json();
    if(!response.ok||!result.success||result.data.raceId!==c.raceId||result.data.eventId!==(data.eventId??data.raceId))throw Error(c.name);
    return result.data as RaceSnapshot;
   }));
   clearTimeout(timeout);if(!alive)return;setReceived(results.flatMap(r=>r.status==="fulfilled"?[r.value]:[]));
   if(results.some(r=>r.status==="rejected"))setError("일부 종목을 불러오지 못했습니다. 전체 인원과 지도에 누락된 종목이 있을 수 있습니다.");setLoading(false);
  }
  void load();return()=>{alive=false;clearTimeout(timeout);controller.abort();};
 },[data,simulationSnapshots,retry]);
 const snapshots=simulationSnapshots??[data,...received];
 // Stable geometry keeps the map's zoom/pan intact as virtual time and runners change.
 const definition=JSON.stringify(snapshots.filter(s=>s.course).map(s=>({id:s.raceId!,name:s.course!.name,course:s.course!})));
 const courses=useMemo(()=> (JSON.parse(definition) as {id:string;name:string;course:NonNullable<RaceSnapshot["course"]>}[]).map(c=>({id:c.id,name:c.name,course:buildCourse(c.course.points,c.course.distanceMeters)})),[definition]);
 const additionalCourses=useMemo(()=>courses.slice(1),[courses]);
 const groups=snapshots.map(snapshot=>{const geometry=courses.find(c=>c.id===snapshot.raceId);return {snapshot,geometry,states:geometry?snapshot.runners.map(r=>trackRunner(r,snapshot.checkpoints[r.id]??[],geometry.course,now)):[]};});
 const states=groups.flatMap(g=>g.states.map(state=>({...state,runner:{...state.runner,id:`${g.snapshot.raceId}:${state.runner.id}`}})));
 const runnerCourses:Record<string,Course>=Object.fromEntries(groups.flatMap(g=>g.states.map(s=>[`${g.snapshot.raceId}:${s.runner.id}`,g.geometry!.course])));
 const first=courses[0];
 return <div className="space-y-5">
  <section className="rounded-xl border p-4"><h2 className="font-bold">대회 전체 종목</h2><p className="mt-2 text-sm text-zinc-500">종목별 선수와 코스를 함께 표시합니다. 상세 기록과 응원 지점은 종목을 선택해 확인하세요.</p><div className="mt-3 flex flex-wrap gap-3">{courses.map((c,i)=><button key={c.id} type="button" onClick={()=>onOpen(c.id)} className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold"><span aria-hidden style={{backgroundColor:colors[i%colors.length]}} className="mr-2 inline-block h-3 w-3 rounded-full"/>{c.name} · {c.course.distanceMeters/1000}km</button>)}</div></section>
  {loading&&<p role="status" className="rounded-xl border p-4 text-sm">전체 종목을 불러오는 중입니다…</p>}
  {error&&<div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>{error}</p><button type="button" className="button-secondary mt-3" onClick={()=>setRetry(n=>n+1)}>종목 다시 불러오기</button></div>}
  <dl aria-label="전체 종목 선수 집계" className="grid grid-cols-3 divide-x rounded-xl bg-zinc-100/60 p-4 text-center">{[["참가",states.length],["달리는 중",states.filter(s=>["running","stale","finish-pending"].includes(s.status)).length],["완주",states.filter(s=>s.status==="finished").length]].map(([label,count])=><div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-2xl font-bold">{count}</dd></div>)}</dl>
  <section aria-label="전체 종목 선수 현황"><h2 className="font-bold">선수 현황 · 전체 종목</h2><input type="search" aria-label="전체 종목 선수 검색" placeholder="이름 · 배번호 · 종목 · 그룹 검색" className="input mt-3" value={query} onChange={e=>setQuery(e.target.value)}/>{groups.map(g=>{const filtered=g.states.filter(s=>`${g.snapshot.course?.name} ${s.runner.name} ${s.runner.bib} ${s.runner.groupName??""}`.toLowerCase().includes(query.trim().toLowerCase()));return <section key={g.snapshot.raceId} className="mt-4 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{g.snapshot.course?.name} · {g.states.length}명</h3><button className="min-h-11 text-sm font-semibold underline" onClick={()=>onOpen(g.snapshot.raceId!)}>종목 상세 보기</button></div><div className="divide-y">{filtered.map(s=><button key={s.runner.id} type="button" onClick={()=>onOpen(g.snapshot.raceId!,s.runner.id)} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-2 py-3 text-left"><span><strong>{s.runner.name}</strong><small className="block text-zinc-500">#{s.runner.bib} · {s.runner.groupName??"그룹 미지정"} · {trackingStatusLabel(s)}</small></span><strong>{(s.distanceMeters/1000).toFixed(1)}km</strong></button>)}</div>{!filtered.length&&<p className="py-3 text-sm text-zinc-500">{g.states.length?"검색 결과가 없습니다.":"등록된 선수가 없습니다."}</p>}</section>;})}</section>
  {first&&<section aria-label="전체 종목 코스 지도" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">전체 종목 코스 지도</h2><button type="button" className="min-h-11 rounded-xl border px-4 py-2 text-sm" onClick={()=>setExpanded(v=>!v)}>{expanded?"지도 줄이기":"지도 크게 보기"}</button></div><TrackingMap course={first.course} additionalCourses={additionalCourses} runnerCourses={runnerCourses} runners={states} selectedId="" onSelect={id=>{const state=groups.flatMap(g=>g.states.map(s=>({key:`${g.snapshot.raceId}:${s.runner.id}`,courseId:g.snapshot.raceId!,runnerId:s.runner.id}))).find(s=>s.key===id);if(state)onOpen(state.courseId,state.runnerId);}} revision={0} compact expanded={expanded}/></section>}
 </div>;
}
