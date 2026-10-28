"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {LiveTracking} from "./live-tracking";
import {buildCourse,positionAtDistance,courseFromGPX} from "@/lib/race-tracking/course";
import {DEMO_COURSE,DEMO_DURATION_SECONDS,DEMO_START,MockTimingProvider} from "@/lib/race-tracking/providers/mock";
import {MAX_GPX_FILE_BYTES} from "@/lib/race-tracking/registration";
import type {Course} from "@/lib/race-tracking/types";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
const provider=new MockTimingProvider();
export function formatDuration(seconds:number|null){if(seconds===null)return "—";const n=Math.max(0,Math.round(seconds));return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
const tenK=buildCourse([...DEMO_COURSE.points.filter((_,i)=>DEMO_COURSE.cumulativeMeters[i]/DEMO_COURSE.measuredMeters*DEMO_COURSE.distanceMeters<10000),positionAtDistance(DEMO_COURSE,10000)],10000);
export function TrackingDemo({eventTitle}:{eventTitle?:string}){
 const[elapsed,setElapsed]=useState(15*60),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(10),[short,setShort]=useState(false);
 const elapsedRef=useRef(elapsed);
 useEffect(()=>{elapsedRef.current=elapsed;},[elapsed]);
 useEffect(()=>{if(!playing)return;const base=elapsedRef.current,at=performance.now();const timer=setInterval(()=>setElapsed(Math.min(DEMO_DURATION_SECONDS,base+(performance.now()-at)/1000*speed)),1000);return()=>clearInterval(timer);},[playing,speed]);
 const [imports,setImports]=useState<Record<string,{course:Course;fileName:string}>>({});
 const [uploadErrors,setUploadErrors]=useState<Record<string,string>>({});
 const uploadVersions=useRef<Record<string,number>>({});
 async function importCourse(id:string,file?:File){
  if(!file)return;
  const version=(uploadVersions.current[id]??0)+1;
  uploadVersions.current[id]=version;
  setUploadErrors(previous=>({...previous,[id]:""}));
  try{
   if(!file.name.toLowerCase().endsWith(".gpx"))throw new Error("GPX 파일을 선택해주세요.");
   if(file.size>MAX_GPX_FILE_BYTES)throw new Error("GPX 파일은 10MB 이하로 선택해주세요.");
   const course=courseFromGPX(await file.text(),id==="demo-10k"?10000:DEMO_COURSE.distanceMeters);
   if(uploadVersions.current[id]!==version)return;
   setImports(previous=>({...previous,[id]:{course,fileName:file.name}}));
  }catch(error){if(uploadVersions.current[id]===version)setUploadErrors(previous=>({...previous,[id]:error instanceof Error?error.message:"GPX 파일을 읽을 수 없습니다."}));}
 }
 const now=DEMO_START+elapsed*1000;
 const halfCourse=imports["demo-half"]?.course??DEMO_COURSE;
 const shortCourse=imports["demo-10k"]?.course??tenK;
 // Course geometry must retain its identity while the simulation clock advances.
 const demoCourses=useMemo(()=>[{raceId:"demo-half",name:"하프",course:halfCourse,names:["김진우","이영희","박철수","정수빈","최민재","한서연"]},{raceId:"demo-10k",name:"10K",course:shortCourse,names:["윤도현","강지민","임준서","오하린","서태훈","배유나"]}].map(c=>({...c,courseInfo:{name:c.name,points:c.course.points,distanceMeters:c.course.distanceMeters,startAt:new Date(DEMO_START).toISOString()}})),[halfCourse,shortCourse]);
 const allSnapshots=useMemo<RaceSnapshot[]>(()=>{
  return demoCourses.map(({raceId,course,names,courseInfo})=>{
   const originals=provider.getRunners(now);
   const runners=originals.map((r,i)=>({...r,id:`${raceId}-${r.id}`,name:names[i],groupName:i%2?"B그룹":"A그룹",groupPaceSeconds:i%2?360:330,useGroupPrediction:true}));
   return {raceId,courses:demoCourses.map(c=>({raceId:c.raceId,name:c.name,distanceMeters:c.course.distanceMeters,startAt:new Date(DEMO_START).toISOString()})),serverNow:new Date(now).toISOString(),title:eventTitle??"가상 대회",currentUserId:"demo",canManage:false,courseLocked:true,course:courseInfo,runners,checkpoints:Object.fromEntries(runners.map((r,i)=>[r.id,provider.getCheckpoints(originals[i].bib,now).filter(c=>c.distanceMeters<=course.distanceMeters).map(c=>({...c,id:`${raceId}-${c.id}`,name:c.distanceMeters===course.distanceMeters?"FINISH":c.name}))])),participants:[],entries:[]};
  });
 },[now,demoCourses,eventTitle]);
 const data=allSnapshots[short?1:0];
 return <div className="mt-4 space-y-4">
  <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6"><strong>DEMO · 실제 기록에 저장되지 않습니다</strong><p className="mt-1 text-xs text-zinc-500">실제 대회와 같은 화면으로 가상 선수·계측을 체험합니다. 재생 제어에서 가상 시각을 변경할 수 있습니다. 기본 코스는 서울레이스 GPX를 활용하며, 10K는 체험용으로 자른 경로입니다. 아래에서 종목별 GPX를 변경할 수 있습니다.</p></aside>
  <section aria-label="데모 코스 변경" className="space-y-3 rounded-xl border border-zinc-200 p-4">
   <h2 className="text-sm font-semibold">데모 코스 변경</h2>
   <p className="text-xs leading-5 text-zinc-500">종목별 GPX를 선택하면 지도와 선수 예상 위치에 바로 반영됩니다. 하프 21.0975km · 10K 10km의 진행률을 업로드한 전체 경로에 비례해 표시합니다. 변경은 현재 데모에서만 적용되며 새로고침하면 초기화됩니다.</p>
   {[{id:"demo-half",name:"하프"},{id:"demo-10k",name:"10K"}].map(({id,name})=><div key={id} className="space-y-2 rounded-lg bg-zinc-50 p-3">
    <label className="block text-sm font-semibold">{name} GPX 파일<input type="file" accept=".gpx" aria-label={`${name} GPX 파일`} className="mt-2 block w-full text-sm" onChange={e=>{void importCourse(id,e.target.files?.[0]);e.target.value="";}}/></label>
    <p role="status" className="break-all text-xs text-zinc-600">{imports[id]?`적용된 파일: ${imports[id].fileName} · GPX 거리 ${(imports[id].course.measuredMeters/1000).toFixed(2)}km`:"기본 코스 사용 중"}</p>
    {uploadErrors[id]&&<p role="alert" className="text-sm text-red-700">{uploadErrors[id]}</p>}
    {imports[id]&&<button type="button" className="min-h-11 text-sm underline" onClick={()=>{uploadVersions.current[id]=(uploadVersions.current[id]??0)+1;setImports(previous=>{const next={...previous};delete next[id];return next;});setUploadErrors(previous=>({...previous,[id]:""}));}}>기본 코스로 복원</button>}
   </div>)}
  </section>
  <LiveTracking scheduleId={data.raceId!} title={data.title} simulation={{snapshot:data,now,allSnapshots,onCourseSelect:id=>setShort(id==="demo-10k"),controls:(
  <details className="tracking-demo-controls rounded-xl border border-zinc-200 p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">데모 재생 제어</summary><div aria-label="데모 재생 제어" className="mt-3 space-y-3"><div className="flex flex-wrap items-center gap-2"><button className="min-h-11 rounded-xl border px-4 text-sm" onClick={()=>setPlaying(!playing)}>{playing?"일시정지":"재생"}</button><button className="min-h-11 rounded-xl border px-4 text-sm" onClick={()=>{setElapsed(0);setPlaying(false);}}>처음으로</button><label className="text-sm">속도 <select aria-label="재생 속도" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,10,60].map(n=><option key={n} value={n}>{n}배</option>)}</select></label></div><label className="block text-xs">가상 시각 {new Date(now).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})} · 출발 후 {formatDuration(elapsed)}<input aria-label="가상 대회 진행 시각" type="range" min={0} max={DEMO_DURATION_SECONDS} step={30} value={elapsed} onChange={e=>{setElapsed(Number(e.target.value));setPlaying(false);}} className="mt-3 w-full accent-[#22261f]"/></label></div></details>
  )}}/>
 </div>;
}
