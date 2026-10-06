"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { courseFromGPX,courseFromGeoJSON } from "@/lib/race-tracking/course";
import type { Coordinate } from "@/lib/race-tracking/types";
export function RaceRegistrationForm({ready=true}:{ready?:boolean}){
 const router=useRouter();const[points,setPoints]=useState<Coordinate[]|null>(null),[fileLabel,setFileLabel]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 function parse(source:string,name:string){
  const c=name.toLowerCase().endsWith(".gpx")?courseFromGPX(source):courseFromGeoJSON(JSON.parse(source));
  if(c.points.length>20000)throw new Error("좌표는 최대 20,000개입니다.");
  setPoints(c.points);setFileLabel(`${name} · ${c.points.length}개 좌표 · 경로 ${(c.measuredMeters/1000).toFixed(3)}km`);setMessage("");
 }
 const input="mt-1 min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white p-3 text-base";
 return <form className="mt-6 space-y-5 rounded-2xl border p-4 sm:p-6" onSubmit={async e=>{
  e.preventDefault();if(busy||!ready)return;setMessage("");setBusy(true);
  try{
   if(!points)throw new Error("GPX 또는 GeoJSON 코스를 선택해주세요.");
   const f=new FormData(e.currentTarget),date=new Date(String(f.get("start")));
   if(!Number.isFinite(date.getTime()))throw new Error("출발 시각을 확인해주세요.");
   const r=await fetch("/api/tracking",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"course",name:f.get("name"),location:f.get("location"),distanceMeters:Number(f.get("distance"))*1000,startAt:date.toISOString(),points})});
   const result=await r.json();if(!r.ok||!result.success)throw new Error(result.error?.message??"등록하지 못했습니다.");
   router.push(`/tracking/${result.data.raceId}`);router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"등록하지 못했습니다.");}finally{setBusy(false);}
 }}>
  <label className="block text-sm font-semibold">대회·코스 이름<input required name="name" maxLength={100} placeholder="예: 2026 서울레이스 21K" className={input}/></label>
  <label className="block text-sm font-semibold">장소<input name="location" maxLength={200} className={input}/></label>
  <label className="block text-sm font-semibold">공식 거리 (km)<input required name="distance" type="number" min={1} max={100} step="0.0001" placeholder="공식 경기 거리를 입력해주세요" className={input}/></label>
  <label className="block text-sm font-semibold">예정 출발 시각 (기기 시간대)<input required name="start" type="datetime-local" step={1} className={input}/></label>
  <div className="space-y-3 rounded-xl bg-zinc-50 p-4"><h2 className="font-bold">GPX 코스</h2><button type="button" disabled={busy} className="min-h-12 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800 disabled:opacity-40" onClick={async()=>{setBusy(true);setPoints(null);setFileLabel("");try{const r=await fetch("/courses/2026-seoul-race-21k.gpx");if(!r.ok)throw new Error("보관된 코스를 읽지 못했습니다.");parse(await r.text(),"2026-seoul-race-21k.gpx");}catch(e){setMessage(e instanceof Error?e.message:"파일을 읽지 못했습니다.");}finally{setBusy(false);}}}>보관된 서울레이스 GPX 불러오기</button>
   <label className="block text-sm">다른 GPX / GeoJSON 파일<input type="file" accept=".gpx,.geojson,.json" disabled={busy} className={input} onChange={async e=>{setPoints(null);setFileLabel("");const file=e.target.files?.[0];if(!file)return;setBusy(true);try{if(file.size>2000000)throw new Error("파일은 2MB 이하로 선택해주세요.");parse(await file.text(),file.name);}catch(e){setMessage(e instanceof Error?e.message:"파일을 읽지 못했습니다.");}finally{setBusy(false);}}}/></label>
   {fileLabel&&<p className="break-words text-sm font-semibold text-emerald-800">{fileLabel}</p>}<p className="text-xs leading-5 text-zinc-500">GPX 경로 길이와 공식 경기 거리는 다를 수 있습니다. 실제 대회 정보를 확인해 입력해주세요.</p>
  </div>
  {message&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
  <button disabled={busy||!points||!ready} className="min-h-12 w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-40">{busy?"처리 중…":!ready?"DB 설정 후 등록 가능":"추적 대회 등록"}</button>
 </form>;
}
