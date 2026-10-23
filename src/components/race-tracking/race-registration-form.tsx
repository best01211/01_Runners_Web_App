"use client";
import {useRouter} from "next/navigation";
import {useRef,useState} from "react";
import {courseFromGPX,courseFromGeoJSON} from "@/lib/race-tracking/course";
import {MAX_GPX_FILE_BYTES,MAX_REGISTRATION_BYTES,validateRegistration} from "@/lib/race-tracking/registration";
import type {Coordinate} from "@/lib/race-tracking/types";

type Draft={id:number;name:string;distance:string;start:string;points:Coordinate[]|null;measured:number|null;fileLabel:string;error:string};
const empty=(id:number):Draft=>({id,name:"",distance:"",start:"",points:null,measured:null,fileLabel:"",error:""});
const input="mt-1 min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white p-3 text-base";
const secondary="min-h-11 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-40";
export function RaceRegistrationForm({ready=true,parentRaceId,eventName}:{ready?:boolean;parentRaceId?:string;eventName?:string}){
 const router=useRouter(),nextId=useRef(1);
 const[courses,setCourses]=useState<Draft[]>([empty(0)]);
 const[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[reading,setReading]=useState(false);
 const disabled=busy||reading||!ready;
 function update(id:number,patch:Partial<Draft>){setCourses(previous=>previous.map(c=>c.id===id?{...c,...patch}:c));}
 function add(){const id=nextId.current++;setCourses(previous=>previous.length<20?[...previous,empty(id)]:previous);}
 async function read(id:number,file:File|undefined){
  update(id,{points:null,measured:null,fileLabel:"",error:""});setMessage("");
  if(!file)return;
  setReading(true);
  try{
   if(file.size>MAX_GPX_FILE_BYTES)throw new Error("GPX / GeoJSON 파일은 종목별 10MB 이하로 선택해주세요.");
   const source=await file.text();
   const c=file.name.toLowerCase().endsWith(".gpx")?courseFromGPX(source):courseFromGeoJSON(JSON.parse(source));
   if(c.points.length>20000)throw new Error("코스 좌표는 종목별 최대 20,000개입니다. 좌표 수를 줄인 코스 파일을 선택해주세요.");
   update(id,{points:c.points,measured:c.measuredMeters,fileLabel:`${file.name} · ${c.points.length}개 좌표 · 경로 ${(c.measuredMeters/1000).toFixed(3)}km`});
  }catch(e){update(id,{error:e instanceof Error?e.message:"파일을 읽지 못했습니다."});}
  finally{setReading(false);}
 }
 return <form className="mt-6 space-y-5 rounded-2xl border p-4 sm:p-6" onSubmit={async e=>{
  e.preventDefault();if(disabled)return;setMessage("");
  const f=new FormData(e.currentTarget);
  try{
   const payload=validateRegistration({name:eventName??String(f.get("name")),location:String(f.get("location")??""),...(parentRaceId?{parentRaceId}:{}),courses:courses.map((c,i)=>{
    if(!c.points)throw new Error(`${i+1}번째 종목의 GPX 또는 GeoJSON 코스를 선택해주세요.`);
    const date=new Date(c.start);if(!Number.isFinite(date.getTime()))throw new Error(`${i+1}번째 종목의 출발 시각을 확인해주세요.`);
    return {courseName:c.name,distanceMeters:Number(c.distance)*1000,startAt:date.toISOString(),points:c.points};
   })});
   const body=JSON.stringify({action:"event",...payload});
   if(new TextEncoder().encode(body).byteLength>MAX_REGISTRATION_BYTES)throw new Error("코스 전체 전송 크기가 3.5MB를 넘습니다. 종목 수나 좌표 수를 줄여주세요. 등록 후 상세 화면에서 종목을 추가할 수도 있습니다.");
   setBusy(true);
   const response=await fetch("/api/tracking",{method:"POST",headers:{"Content-Type":"application/json"},body});
   const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error?.message??"등록하지 못했습니다.");
   router.push(`/tracking/${result.data.raceId}`);
  }catch(e){setMessage(e instanceof Error?e.message:"등록하지 못했습니다.");}
  finally{setBusy(false);}
 }}>
  <fieldset disabled={disabled} className="space-y-5">
   {!parentRaceId&&<><label className="block text-sm font-semibold">대회 이름<input required name="name" maxLength={100} placeholder="예: 2026 춘천 마라톤" className={input}/></label><label className="block text-sm font-semibold">장소<input name="location" maxLength={200} className={input}/></label></>}
   <div><h2 className="font-bold">종목별 코스 · {courses.length}개</h2><p className="mt-2 text-xs leading-5 text-zinc-500">풀코스와 10K는 종목을 나누고 각 GPX를 연결해주세요. 공식 거리와 출발 시간도 각각 설정합니다.</p></div>
   {courses.map((c,index)=>{
    const official=Number(c.distance)*1000;
    const difference=c.measured!==null&&official>0?(c.measured-official)/official*100:null;
    return <section key={c.id} aria-label={`종목 ${index+1}`} className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
     <div className="flex items-center justify-between gap-2"><h3 className="font-bold">종목 {index+1}{c.name?` · ${c.name}`:""}</h3>{courses.length>1&&<button type="button" onClick={()=>setCourses(previous=>previous.filter(p=>p.id!==c.id))} className={secondary} aria-label={`종목 ${index+1} 제거`}>제거</button>}</div>
     <div className="flex flex-wrap gap-2" aria-label="종목 빠른 설정"><button type="button" className={secondary} onClick={()=>update(c.id,{name:"풀코스",distance:"42.195"})}>풀코스 42.195km</button><button type="button" className={secondary} onClick={()=>update(c.id,{name:"10K",distance:"10"})}>10K</button><button type="button" className={secondary} onClick={()=>update(c.id,{name:"하프",distance:"21.0975"})}>하프</button></div>
     <label className="block text-sm font-semibold">종목 이름<input required maxLength={60} value={c.name} onChange={e=>update(c.id,{name:e.target.value})} placeholder="예: 풀코스 / 10K" className={input}/></label>
     <label className="block text-sm font-semibold">공식 거리 (km)<input required type="number" min={1} max={100} step="0.0001" value={c.distance} onChange={e=>update(c.id,{distance:e.target.value})} placeholder="공식 경기 거리" className={input}/></label>
     <label className="block text-sm font-semibold">예정 출발 시각 (기기 시간대)<input required type="datetime-local" step={1} value={c.start} onChange={e=>update(c.id,{start:e.target.value})} className={input}/></label>
     <label className="block text-sm font-semibold">GPX / GeoJSON 파일<input required type="file" accept=".gpx,.geojson,.json" onChange={e=>void read(c.id,e.target.files?.[0])} className={input}/></label>
     <p className="text-xs leading-5 text-zinc-500">파일은 종목별 최대 10MB, 좌표는 최대 20,000개입니다. 원본 파일 대신 추출한 경로 좌표만 전송합니다.</p>
     {c.fileLabel&&<p className="break-words text-xs font-semibold text-zinc-700">{c.fileLabel}</p>}
     {c.error&&<p role="alert" className="text-sm text-amber-800">{c.error}</p>}
     {difference!==null&&<p className="text-xs text-zinc-600">공식 거리 대비 GPX 차이 {((c.measured!-official)/1000).toFixed(3)}km ({difference.toFixed(1)}%)</p>}
     {difference!==null&&Math.abs(difference)>5&&<p className="text-xs leading-5 text-amber-800">거리 차이가 큽니다. GPX 누락·반복 구간이나 다른 종목의 코스가 아닌지 확인해주세요.</p>}
    </section>;
   })}
   <button type="button" onClick={add} disabled={courses.length>=20} className={`${secondary} w-full`}>+ 종목 추가 (예: 10K 코스)</button>
   <p className="text-xs leading-5 text-zinc-500">공식 거리 기준 진행률을 각 GPX 전체 경로에 비례해 표시합니다. 잘못되거나 누락된 경로는 비례 보정으로 복원되지 않습니다.</p>
  </fieldset>
  {message&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
  <button disabled={disabled||courses.some(c=>!c.points)} className="min-h-12 w-full rounded-xl bg-[var(--foreground)] p-3 font-bold text-white disabled:opacity-40">{busy?"등록 중…":reading?"코스 파일 확인 중…":!ready?"DB 설정 후 등록 가능":parentRaceId?`${courses.length}개 종목 추가`:`추적 대회 등록 · ${courses.length}개 종목`}</button>
 </form>;
}
