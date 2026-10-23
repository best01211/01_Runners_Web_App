"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { courseFromGPX,courseFromGeoJSON } from "@/lib/race-tracking/course";
import type { Coordinate } from "@/lib/race-tracking/types";
export function RaceRegistrationForm({ready=true,parentRaceId,eventName}:{ready?:boolean;parentRaceId?:string;eventName?:string}){
 const[officialDistance,setOfficialDistance]=useState(""),[measuredMeters,setMeasuredMeters]=useState<number|null>(null);
 const officialMeters=Number(officialDistance)*1000;
 const difference=measuredMeters!==null&&Number.isFinite(officialMeters)&&officialMeters>0?{meters:measuredMeters-officialMeters,percent:(measuredMeters-officialMeters)/officialMeters*100}:null;
 const router=useRouter();const[points,setPoints]=useState<Coordinate[]|null>(null),[fileLabel,setFileLabel]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 function parse(source:string,name:string){
  const c=name.toLowerCase().endsWith(".gpx")?courseFromGPX(source):courseFromGeoJSON(JSON.parse(source));
  if(c.points.length>20000)throw new Error("좌표는 최대 20,000개입니다.");
  setMeasuredMeters(c.measuredMeters);setPoints(c.points);setFileLabel(`${name} · ${c.points.length}개 좌표 · 경로 ${(c.measuredMeters/1000).toFixed(3)}km`);setMessage("");
 }
 const input="mt-1 min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white p-3 text-base";
 return <form className="mt-6 space-y-5 rounded-2xl border p-4 sm:p-6" onSubmit={async e=>{
  e.preventDefault();if(busy||!ready)return;setMessage("");setBusy(true);
  try{
   if(!points)throw new Error("GPX 또는 GeoJSON 코스를 선택해주세요.");
   const f=new FormData(e.currentTarget),date=new Date(String(f.get("start")));
   if(!Number.isFinite(date.getTime()))throw new Error("출발 시각을 확인해주세요.");
   const r=await fetch("/api/tracking",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"course",name:eventName??f.get("name"),courseName:f.get("courseName"),...(parentRaceId?{parentRaceId}:{}),location:f.get("location"),distanceMeters:Number(f.get("distance"))*1000,startAt:date.toISOString(),points})});
   const result=await r.json();if(!r.ok||!result.success)throw new Error(result.error?.message??"등록하지 못했습니다.");
   router.push(`/tracking/${result.data.raceId}`);
  }catch(e){setMessage(e instanceof Error?e.message:"등록하지 못했습니다.");}finally{setBusy(false);}
 }}>
  {!parentRaceId&&<label className="block text-sm font-semibold">대회 이름<input required name="name" maxLength={100} placeholder="예: 2026 춘천 마라톤" className={input}/></label>}
  <label className="block text-sm font-semibold">종목 이름<input required name="courseName" maxLength={60} placeholder="예: 풀코스 / 10K" className={input}/></label>
  <label className="block text-sm font-semibold">장소<input name="location" maxLength={200} className={input}/></label>
  <label className="block text-sm font-semibold">공식 거리 (km)<input required name="distance" value={officialDistance} onChange={e=>setOfficialDistance(e.target.value)} type="number" min={1} max={100} step="0.0001" placeholder="공식 경기 거리를 입력해주세요" className={input}/></label>
  <label className="block text-sm font-semibold">예정 출발 시각 (기기 시간대)<input required name="start" type="datetime-local" step={1} className={input}/></label>
  <div className="space-y-3 rounded-xl bg-zinc-50 p-4"><h2 className="font-bold">GPX 코스</h2>
   <label className="block text-sm">GPX / GeoJSON 파일<input type="file" accept=".gpx,.geojson,.json" disabled={busy} className={input} onChange={async e=>{setPoints(null);setMeasuredMeters(null);setFileLabel("");const file=e.target.files?.[0];if(!file)return;setBusy(true);try{if(file.size>2000000)throw new Error("파일은 2MB 이하로 선택해주세요.");parse(await file.text(),file.name);}catch(e){setMessage(e instanceof Error?e.message:"파일을 읽지 못했습니다.");}finally{setBusy(false);}}}/></label>
   {fileLabel&&<p className="break-words text-sm font-semibold text-emerald-800">{fileLabel}</p>}<p className="text-xs leading-5 text-zinc-500">공식 거리를 기준으로 계산한 진행률을 GPX 전체 경로에 비례해 표시합니다. GPX 경로 길이가 달라도 결승점은 공식 거리의 끝에 맞춥니다.</p>
   {difference&&<p className="text-xs text-zinc-600">공식 거리 대비 GPX 차이 {(difference.meters/1000).toFixed(3)}km ({difference.percent.toFixed(1)}%)</p>}
   {difference&&Math.abs(difference.percent)>5&&<p className="text-sm text-amber-800">거리 차이가 큽니다. GPX 누락·반복 구간이나 다른 코스가 아닌지 확인해주세요. 비례 보정만으로 잘못된 경로를 복원할 수는 없습니다.</p>}
  </div>
  {message&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
  <button disabled={busy||!points||!ready} className="min-h-12 w-full rounded-xl bg-[var(--foreground)] p-3 font-bold text-white disabled:opacity-40">{busy?"처리 중…":!ready?"DB 설정 후 등록 가능":parentRaceId?"종목 추가":"추적 대회 등록"}</button>
 </form>;
}
