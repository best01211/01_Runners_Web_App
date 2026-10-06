"use client";
import { LiveTrackingView } from "./live-tracking-view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { buildCourse, courseFromGeoJSON, courseFromGPX } from "@/lib/race-tracking/course";
import { trackRunner } from "@/lib/race-tracking/engine";
import type { RaceSnapshot } from "@/lib/race-tracking/live-types";
import type { RaceWrite } from "@/lib/race-tracking/validation";
import type { Coordinate } from "@/lib/race-tracking/types";

const inputClass = "mt-1 w-full rounded-xl border border-zinc-300 bg-white p-3 text-base";
const buttonClass = "min-h-12 w-full sm:w-auto rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-40";

export function LiveTracking({ scheduleId, title, apiPath }: { scheduleId: string; title: string; apiPath?: string }) {
 const endpoint = apiPath ?? `/api/schedules/${scheduleId}/tracking`;
 const [data, setData] = useState<RaceSnapshot | null>(null);
 const [error, setError] = useState("");
 const [now, setNow] = useState(0);
 const [selection, setSelection] = useState("");
 const [refreshing, setRefreshing] = useState(false);
 const anchor = useRef<{ now: number; at: number; healthy: boolean } | null>(null);
 const activeRequest = useRef<AbortController | null>(null);
 const mounted = useRef(false);
 const load = useCallback(async () => {
  if (activeRequest.current) return;
  const controller = new AbortController(); activeRequest.current = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  if (mounted.current) setRefreshing(true);
  try {
   const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
   const result = await response.json();
   if (!response.ok || !result.success) throw new Error(result.error?.message ?? "추적 정보를 불러오지 못했습니다.");
   if (!mounted.current || activeRequest.current !== controller) return;
   const snapshot = result.data as RaceSnapshot;
   anchor.current = { now: Date.parse(snapshot.serverNow), at: performance.now(), healthy: true };
   setNow(anchor.current.now);
   setData(previous => ({ ...snapshot, course: JSON.stringify(previous?.course) === JSON.stringify(snapshot.course) ? previous!.course : snapshot.course }));
   setError("");
  } catch (e) {
   if (!mounted.current || activeRequest.current !== controller) return;
   if (anchor.current) anchor.current.healthy = false;
   setError(e instanceof Error && e.name !== "AbortError" ? e.message : "서버 연결이 지연됩니다. 마지막 수신 위치를 유지합니다.");
  } finally {
   clearTimeout(timeout); if (activeRequest.current === controller) activeRequest.current = null;
   if (mounted.current) setRefreshing(false);
  }
 }, [endpoint]);
 useEffect(() => {
  mounted.current = true; void load();
  const poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
  const tick = setInterval(() => { const a = anchor.current; if (a?.healthy) setNow(a.now + Math.min(30000, performance.now() - a.at)); }, 1000);
  const visible = () => { if (document.visibilityState === "visible") void load(); };
  document.addEventListener("visibilitychange", visible);
  return () => { mounted.current = false; activeRequest.current?.abort(); activeRequest.current = null; clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", visible); };
 }, [load]);
 const courseData = data?.course;
 const course = useMemo(() => courseData ? buildCourse(courseData.points, courseData.distanceMeters) : null, [courseData]);
 const states = useMemo(() => course && data ? data.runners.map(runner => trackRunner(runner, data.checkpoints[runner.id] ?? [], course, now)) : [], [course, data, now]);

 async function write(payload: RaceWrite) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error?.message ?? "저장하지 못했습니다.");
  await load();
 }
 return <div className="mt-4 space-y-4 text-zinc-900">
  <header className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-bold text-emerald-800">대회 선수 추적 · 수동 계측</p><h1 className="mt-2 break-words text-2xl font-black sm:text-3xl">{title}</h1>{!data?.course && <p className="mt-3 text-sm leading-6">계측 기록으로 계산한 예상 위치입니다. GPS 실측 위치가 아닙니다.</p>}</header>
  <div className="flex items-center justify-between gap-3 px-1"><p className="min-w-0 text-xs leading-5 text-zinc-500">{data ? `마지막 수신: ${new Date(data.serverNow).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} · 15초마다 갱신` : "추적 정보를 불러오는 중입니다."}</p><button className="min-h-11 shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={refreshing} onClick={() => void load()}>{refreshing ? "갱신 중…" : "새로고침"}</button></div>
  {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">{error}{data && " 마지막 수신 위치를 유지하고 있습니다."}</p>}
  {data && !course && <p className="rounded-2xl border p-5">코스가 아직 등록되지 않았습니다. 운영진이 공식 거리와 코스 파일을 등록하면 추적이 시작됩니다.</p>}
  {course && data && <LiveTrackingView data={data} course={course} states={states} selectedId={selection} onSelect={setSelection}/> }
  {data?.canManage && <section aria-label="실제 추적 준비 상태" className="rounded-2xl border border-zinc-200 bg-white p-4">
   <h2 className="text-sm font-bold">실제 추적 준비 상태</h2>
   <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
    <li className="rounded-xl bg-zinc-50 p-3">{course ? "✓" : "○"} 코스 {course ? "등록 완료" : "등록 필요"}</li>
    <li className="rounded-xl bg-zinc-50 p-3">{data.runners.length ? "✓" : "○"} 출전 선수 {data.runners.length}명</li>
    <li className="rounded-xl bg-zinc-50 p-3">{Object.values(data.checkpoints).some(records => records.length) ? "✓" : "○"} 계측 기록 {Object.values(data.checkpoints).reduce((sum, records) => sum + records.length, 0)}개</li>
   </ul>
   <p className="mt-3 text-xs leading-5 text-zinc-600">{!data.runners.length ? "다음 단계: 아래 관리자 메뉴에서 실제 참가자와 배번호를 등록해주세요." : !Object.values(data.checkpoints).some(records => records.length) ? "다음 단계: 실제 확인한 START 또는 계측소 통과 기록을 입력해주세요. 현재 위치는 예정 출발과 목표 페이스 기준입니다." : "수동 계측 기록이 연결되어 있습니다. 다른 기기에서 최근 계측 기록이 반영되는지 확인해주세요."}</p>
   <p className="mt-2 text-xs leading-5 text-zinc-500">계측 업체 자동 연동: 미연결 · 서버에서 15초마다 기록 조회 · GPS 위치 아님</p>
  </section>}
  {data?.canManage && <details open={!data.course} className="rounded-2xl border border-zinc-200 bg-white"><summary className="min-h-14 cursor-pointer px-4 py-4 text-sm font-bold">{data.canManage ? "관리자 · 코스와 계측 관리" : "내 배번호 등록·수정"}</summary><RaceForms data={data} write={write}/></details>}
 </div>;
}

function RaceForms({ data, write }: { data: RaceSnapshot; write: (payload: RaceWrite) => Promise<void> }) {
 const [message, setMessage] = useState("");
 const [busy, setBusy] = useState(false);
 const [points, setPoints] = useState<Coordinate[] | null>(null);
 const [fileName, setFileName] = useState("");
 const [entryChoice, setEntryChoice] = useState("");
 const chosenEntry = entryChoice || data.entries[0]?.entryId || "";
 async function submit(event: FormEvent<HTMLFormElement>, payload: (form: FormData) => RaceWrite) {
  event.preventDefault(); if (busy) return;
  setBusy(true); setMessage("");
  try { await write(payload(new FormData(event.currentTarget))); setMessage("저장했습니다."); }
  catch(e) { setMessage(e instanceof Error ? e.message : "저장하지 못했습니다."); }
  finally { setBusy(false); }
 }
 const date = (value: FormDataEntryValue | null) => { const d = new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error("통과 시각을 입력해주세요."); return d.toISOString(); };
 return <section aria-label="출전 정보와 계측 관리" className="space-y-4 border-t border-zinc-100 p-4 sm:p-5">
  <h2 className="text-xl font-bold">{data.canManage ? "출전 정보와 계측 관리" : "내 출전 정보"}</h2>
  <p className="text-sm text-zinc-600">관리자가 출전 회원과 배번호를 등록합니다. 계측 완주는 출석 점수·랭킹에 자동 반영되지 않습니다.</p>
  {message && <p role="status" className="rounded-xl bg-zinc-100 p-3 text-sm">{message}</p>}
  {data.canManage && !data.courseLocked && <form className="space-y-3 rounded-xl bg-zinc-50 p-4" onSubmit={e => void submit(e, f => { if (!points) throw new Error("코스 파일을 선택해주세요."); return { action: "course", name: String(f.get("name")), distanceMeters: Number(f.get("distance"))*1000, startAt: date(f.get("start")), points }; })}>
   <h3 className="font-bold">코스 설정</h3><p className="text-xs text-zinc-500">선수 등록 후에는 코스·출발 시각을 변경할 수 없습니다. 공식 거리와 좌표 경로를 확인해주세요.</p>
   <label className="block text-sm">코스 이름<input required maxLength={100} name="name" defaultValue={data.course?.name ?? ""} className={inputClass}/></label>
   <label className="block text-sm">공식 거리 (km)<input required type="number" min={1} max={100} step="0.001" name="distance" defaultValue={data.course ? data.course.distanceMeters/1000 : 42.195} className={inputClass}/></label>
   <label className="block text-sm">예정 출발 시각 (기기 시간대)<input required type="datetime-local" step={1} name="start" className={inputClass}/></label>
   <label className="block text-sm">공식 코스 파일 (GPX / GeoJSON)<input required type="file" accept=".gpx,.geojson,.json" className={inputClass} onChange={async e => { setPoints(null); setFileName(""); const file = e.target.files?.[0]; if (!file) return; try { if (file.size>2000000) throw new Error("코스 파일은 2MB 이하로 선택해주세요."); const source = await file.text(); const c = file.name.toLowerCase().endsWith(".gpx") ? courseFromGPX(source) : courseFromGeoJSON(JSON.parse(source)); if (c.points.length>20000) throw new Error("코스 좌표는 최대 20,000개입니다."); setPoints(c.points); setFileName(`${file.name} · ${c.points.length}개 좌표 · 좌표 거리 ${(c.measuredMeters/1000).toFixed(3)}km`); setMessage(""); } catch(e) { setMessage(e instanceof Error ? e.message : "파일을 읽지 못했습니다."); } }}/></label>
   {fileName && <p className="text-xs text-emerald-800">{fileName}</p>}<button disabled={busy || !points} className={buttonClass}>코스 저장</button>
  </form>}
  {data.course && data.participants.length>0 && <form className="space-y-3 rounded-xl bg-zinc-50 p-4" onSubmit={e => void submit(e, f => ({ action:"entry", userId:String(f.get("user")), bib:String(f.get("bib")), targetPaceSeconds:f.get("pace") ? Number(f.get("pace")) : null }))}><h3 className="font-bold">배번호 등록·수정</h3><label className="block text-sm">참가자<select name="user" className={inputClass}>{data.participants.map(p => <option key={p.userId} value={p.userId}>{p.name}{data.entries.some(e => e.userId===p.userId) ? " (배번호 등록됨)" : ""}</option>)}</select></label><label className="block text-sm">배번호<input required name="bib" maxLength={20} pattern="[A-Za-z0-9-]+" className={inputClass}/></label><label className="block text-sm">목표 페이스 (초/km, 선택)<input type="number" name="pace" min={120} max={1200} step={1} placeholder="예: 360 = 6:00/km" className={inputClass}/></label><p className="text-xs text-zinc-500">계측 기록 등록 후 배번호·페이스 수정은 잠깁니다.</p><button disabled={busy} className={buttonClass}>배번호 저장</button></form>}
  {data.canManage && data.entries.length>0 && <div className="space-y-4 rounded-xl bg-zinc-50 p-4"><label className="block text-sm">계측 대상 선수<select value={chosenEntry} onChange={e => setEntryChoice(e.target.value)} className={inputClass}>{data.entries.map(e => <option key={e.entryId} value={e.entryId}>{data.runners.find(r => r.id===e.entryId)?.name} · BIB {e.bib}</option>)}</select></label>
   <form className="space-y-3" onSubmit={e => void submit(e,f => ({ action:"checkpoint", entryId:chosenEntry, name:String(f.get("name")), distanceMeters:Number(f.get("distance"))*1000, passedAt:date(f.get("passed")) }))}><h3 className="font-bold">통과 기록 입력</h3><p className="text-xs text-zinc-500">실제 확인한 기록만 입력해주세요. START는 0km, FINISH는 공식 거리입니다. 기록은 거리·시각 순서대로 입력하며, 저장 후 이 화면에서는 변경할 수 없습니다.</p><label className="block text-sm">지점 이름<input required maxLength={40} name="name" placeholder="START / 5K / FINISH" className={inputClass}/></label><label className="block text-sm">통과 거리 (km)<input required type="number" name="distance" min={0} max={data.course!.distanceMeters/1000} step="0.001" className={inputClass}/></label><label className="block text-sm">통과 시각 (기기 시간대)<input required type="datetime-local" step={1} name="passed" className={inputClass}/></label><button disabled={busy} className={buttonClass}>통과 기록 저장</button></form>
   <form className="space-y-3 border-t pt-4" onSubmit={e => void submit(e, f => ({ action:"status", entryId:chosenEntry, status:String(f.get("status")) as "running"|"dnf"|"dns" }))}><h3 className="font-bold">출전 상태</h3><select name="status" aria-label="출전 상태" className={inputClass}><option value="running">주행</option><option value="dnf">중도 포기 (DNF)</option><option value="dns">미출발 (DNS)</option></select><button disabled={busy} className={buttonClass}>상태 저장</button></form>
  </div>}
 </section>;
}
