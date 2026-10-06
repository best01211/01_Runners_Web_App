"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { Course, TrackingState } from "@/lib/race-tracking/types";
import type { RaceSnapshot } from "@/lib/race-tracking/live-types";

const TrackingMap = dynamic(() => import("./tracking-map"), { ssr: false, loading: () => <div className="flex min-h-[280px] items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">지도 준비 중…</div> });
const labels: Record<TrackingState["status"], string> = { "not-started":"출발 전", running:"주행 예상", stale:"계측 지연", "finish-pending":"완주 계측 대기", finished:"완주 계측", dnf:"중도 포기", dns:"미출발" };
const clock = (value: string) => new Date(value).toLocaleTimeString("ko-KR", { timeZone:"Asia/Seoul", hour12:false });
function duration(seconds: number | null) {
 if (seconds === null) return "—";
 const n = Math.max(0, Math.round(seconds));
 return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
}
function pace(seconds: number) { const n=Math.round(seconds); return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`; }

export function LiveTrackingView({ data, course, states, selectedId, onSelect }: {
 data: RaceSnapshot; course: Course; states: TrackingState[]; selectedId: string; onSelect: (id: string) => void;
}) {
 const [query, setQuery] = useState("");
 const selected = states.find(s=>s.runner.id===selectedId) ?? states[0];
 const filtered = useMemo(()=>states.filter(s=>`${s.runner.name} ${s.runner.bib}`.toLowerCase().includes(query.trim().toLowerCase())),[states,query]);
 const roster = <div className="space-y-2">{filtered.map(s=><button type="button" key={s.runner.id} onClick={()=>onSelect(s.runner.id)} aria-pressed={selected?.runner.id===s.runner.id} className={`min-h-16 w-full rounded-xl border p-3 text-left transition-colors ${selected?.runner.id===s.runner.id ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-white"}`}><span className="flex items-center justify-between gap-2"><strong className="min-w-0 truncate text-sm">{s.runner.name}</strong><span className="shrink-0 text-sm font-bold tabular-nums">{(s.distanceMeters/1000).toFixed(2)}km</span></span><span className="mt-1 block text-xs text-zinc-500">BIB {s.runner.bib} · {labels[s.status]}</span></button>)}{!filtered.length&&<p className="py-4 text-sm text-zinc-500">{states.length ? "검색 결과가 없습니다." : "배번호가 등록된 선수가 없습니다."}</p>}</div>;
 const search = <label className="block"><span className="sr-only">선수 이름 또는 배번호 검색</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="이름 또는 배번호 검색" className="min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-base outline-none focus:border-emerald-500"/></label>;
 return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
  <div className="min-w-0 space-y-4">
   <section aria-label="라이브 지도" className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
    <div className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><h2 className="truncate text-sm font-bold">{data.course!.name}</h2><p className="mt-0.5 text-xs text-zinc-500">계측 기반 예상 위치 · GPS 아님</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{(course.distanceMeters/1000).toFixed(3)}km</span></div>
    <TrackingMap course={course} runners={states} selectedId={selected?.runner.id ?? ""} onSelect={onSelect} revision={0} compact/>
    {states.length>0&&<div aria-label="빠른 선수 선택" className="flex gap-2 overflow-x-auto overscroll-x-contain px-3 py-3 lg:hidden">{states.map(s=><button type="button" key={s.runner.id} onClick={()=>onSelect(s.runner.id)} aria-pressed={selected?.runner.id===s.runner.id} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${selected?.runner.id===s.runner.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-200 bg-white text-zinc-700"}`}>{s.runner.name} <span className="text-xs opacity-75">#{s.runner.bib}</span></button>)}</div>}
   </section>
   {selected&&<section aria-label="선택 선수 요약" className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-zinc-500">BIB {selected.runner.bib}</p><h2 className="mt-1 break-words text-xl font-black">{selected.runner.name}</h2></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${["stale","dnf","dns"].includes(selected.status) ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{labels[selected.status]}</span></div>
    <div className="mt-5 flex items-baseline gap-1"><strong className="text-4xl font-black tracking-tight tabular-nums">{(selected.distanceMeters/1000).toFixed(2)}</strong><span className="text-sm font-semibold text-zinc-500">/ {(course.distanceMeters/1000).toFixed(2)} km</span></div>
    <progress aria-label="선택 선수 코스 진행률" max={course.distanceMeters} value={selected.distanceMeters} className="mt-3 h-2 w-full overflow-hidden rounded-full accent-emerald-600"/>
    <dl className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">최근 페이스</dt><dd className="mt-1 text-xl font-bold tabular-nums">{pace(selected.paceSeconds)}<span className="ml-1 text-xs font-normal text-zinc-500">/km</span></dd><dd className="mt-1 text-xs text-zinc-500">{selected.paceSource==="timing" ? "실측 구간 기준" : "목표·기본 페이스"}</dd></div><div className="rounded-xl bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">{selected.status==="finished" ? "계측 완주 시간" : "예상 완주 소요"}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{duration(selected.estimatedFinishSeconds)}</dd><dd className="mt-1 text-xs text-zinc-500">{selected.startSource==="measured" ? "실측 출발 기준" : "예정 출발 기준"}</dd></div></dl>
    <div className="mt-3 rounded-xl border border-zinc-100 p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>최근 계측 {selected.lastCheckpoint?.name ?? "없음"}</strong><span className="tabular-nums text-zinc-600">{selected.lastCheckpoint ? clock(selected.lastCheckpoint.passedAt) : "기록 대기"}</span></div><p className="mt-1 text-xs leading-5 text-zinc-500">{selected.secondsSinceCheckpoint===null ? "실측 기록 없이 계산한 위치입니다." : `마지막 계측 ${Math.floor(selected.secondsSinceCheckpoint/60)}분 전 · 최신성 ${{HIGH:"높음",MEDIUM:"보통",LOW:"낮음"}[selected.confidence]}`}{selected.status==="stale"&&" · 위치 추정 정지"}</p></div>
    {selected.status==="finished"&&selected.startSource!=="measured"&&<p className="mt-2 text-xs text-amber-800">실측 START가 없어 넷타임은 미확정입니다.</p>}
    <details key={selected.runner.id} className="mt-4 border-t border-zinc-100 pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">계측 기록 {(data.checkpoints[selected.runner.id]??[]).length}개 보기</summary><ol className="mt-2 space-y-2">{(data.checkpoints[selected.runner.id]??[]).slice().sort((a,b)=>a.distanceMeters-b.distanceMeters).map(c=><li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm"><div className="min-w-0"><strong className="block break-words">{c.name}</strong><span className="text-xs text-zinc-500">{c.distanceMeters/1000}km · 수동 계측</span></div><time className="shrink-0 text-sm tabular-nums" dateTime={c.passedAt}>{clock(c.passedAt)}</time></li>)}</ol>{!(data.checkpoints[selected.runner.id]??[]).length&&<p className="py-3 text-sm text-zinc-500">아직 수신된 계측 기록이 없습니다.</p>}</details>
   </section>}
   <details className="rounded-2xl border border-zinc-200 bg-white p-4 lg:hidden"><summary className="min-h-11 cursor-pointer py-2 font-bold">전체 선수 {states.length}명 · 검색</summary><div className="mt-3 space-y-3">{search}{roster}</div></details>
   <p className="px-1 text-xs leading-5 text-zinc-500">미계측 45분 이후 추정이 정지됩니다. 예상 위치는 실제 위치와 다를 수 있습니다.</p>
  </div>
  <aside aria-label="출전 선수 목록" className="hidden space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 lg:block"><h2 className="font-bold">출전 선수 {states.length}명</h2>{search}<div className="max-h-[70vh] overflow-y-auto">{roster}</div></aside>
 </div>;
}
