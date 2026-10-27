"use client";
import {TrackingGroupManager} from "./tracking-group-manager";
import { TimingSourcePanel } from "./timing-source-panel";
import { RaceRegistrationForm } from "./race-registration-form";
import Link from "next/link";
import { LiveTrackingView } from "./live-tracking-view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { buildCourse, courseFromGeoJSON, courseFromGPX } from "@/lib/race-tracking/course";
import {nextTrackingRefresh,canRefreshTracking} from "@/lib/race-tracking/refresh-policy";
import { trackRunner } from "@/lib/race-tracking/engine";
import {trackingStatusLabel} from "@/lib/race-tracking/status-label";
import type { RaceSnapshot } from "@/lib/race-tracking/live-types";
import type { RaceWrite } from "@/lib/race-tracking/validation";
import type { TrackingState, Coordinate } from "@/lib/race-tracking/types";

const inputClass = "mt-1 w-full rounded-xl border border-zinc-300 bg-white p-3 text-base";
const buttonClass = "min-h-12 w-full sm:w-auto rounded-xl bg-[#22261f] px-4 py-3 font-bold text-white disabled:opacity-40";

export type TrackingPageView = "overview" | "runner" | "cheer" | "entries" | "admin";
type TrackingSimulation={snapshot:RaceSnapshot;now:number;onCourseSelect:(id:string)=>void;controls?:ReactNode;allSnapshots?:RaceSnapshot[]};
export function LiveTracking({ scheduleId, title, apiPath, initialData, initialView = "overview", simulation,initialSelectedId="" }: { scheduleId: string; title: string; initialData?:RaceSnapshot; apiPath?: string; initialView?:TrackingPageView;simulation?:TrackingSimulation;initialSelectedId?:string }) {
 const simulated=Boolean(simulation);
 const [pane,setPane] = useState(initialView);
 const management = pane === "entries" || pane === "admin";
 const basePath = "/tracking/" + scheduleId;
 const endpoint = apiPath ?? `/api/schedules/${scheduleId}/tracking`;
 const [receivedData, setData] = useState<RaceSnapshot | null>(initialData??null);
 const data=simulation?.snapshot??receivedData;
 const [error, setError] = useState("");
 const [receivedNow, setNow] = useState(initialData?Date.parse(initialData.serverNow):0);
 const now=simulation?.now??receivedNow;
 const [selection, setSelection] = useState(initialSelectedId);
 const [refreshing, setRefreshing] = useState(false);
 const anchor = useRef<{ now: number; at: number; healthy: boolean } | null>(null);
 const activeRequest = useRef<AbortController | null>(null);
 const mounted = useRef(false);
 const lastRefresh=useRef(-Infinity),refreshActive=useRef(false);
 const [coolingDown,setCoolingDown]=useState(false);
 const [cooldownSeconds,setCooldownSeconds]=useState(0);
 const load = useCallback(async () => {
  if (simulated||activeRequest.current) return;
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
 }, [endpoint,simulated]);
 useEffect(() => {
  mounted.current = true;
  if(simulated){const timer=setInterval(()=>{const clock=performance.now();setCoolingDown(!canRefreshTracking(clock,lastRefresh.current));setCooldownSeconds(Math.max(0,Math.ceil((60000-clock+lastRefresh.current)/1000)));},1000);return()=>{mounted.current=false;clearInterval(timer);};}
  if(initialData)anchor.current={now:Date.parse(initialData.serverNow),at:performance.now(),healthy:true};else void load();
  const tick = setInterval(() => { const a = anchor.current,clock=a?a.now+performance.now()-a.at:Date.now();if(a?.healthy)setNow(clock);setCoolingDown(!canRefreshTracking(clock,lastRefresh.current));setCooldownSeconds(Math.max(0,Math.ceil((60000-clock+lastRefresh.current)/1000))); }, 1000);
  return () => { mounted.current = false; activeRequest.current?.abort(); activeRequest.current = null; clearInterval(tick); };
 }, [load,initialData,simulated]);
 const automatic=!!(data?.timing?.enabled&&(data.timing.collectionMode==="public-page"||data.timing.credentialsReady)&&data.timing.courseCode);
 const startAt=data?.course?.startAt;
 const refresh=useCallback(async(manual:boolean)=>{
  if(simulated){const clock=performance.now();if(!canRefreshTracking(clock,lastRefresh.current))return;lastRefresh.current=clock;setCoolingDown(true);setCooldownSeconds(60);return;}
  const a=anchor.current,clock=a?a.now+performance.now()-a.at:Date.now();
  if(refreshActive.current||!canRefreshTracking(clock,lastRefresh.current))return;
  lastRefresh.current=clock;refreshActive.current=true;setCoolingDown(true);setCooldownSeconds(60);setRefreshing(true);
  try{
   if(automatic&&startAt&&clock>=Date.parse(startAt)){
    const r=await fetch(endpoint+"/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({manual}),cache:"no-store",signal:AbortSignal.timeout(55000)});
    const result=await r.json();if(!r.ok||!result.success)throw new Error("자동 계측 갱신이 지연됩니다.");
   }
   await load();
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:"계측 갱신이 지연됩니다.");}
  finally{refreshActive.current=false;if(mounted.current)setRefreshing(false);}
 },[automatic,startAt,endpoint,load,simulated]);
 useEffect(()=>{
  if(simulated||!startAt)return;
  const a=anchor.current,clock=a?a.now+performance.now()-a.at:Date.now();
  let next=nextTrackingRefresh(startAt,clock);
  const timer=setInterval(()=>{
   const anchorValue=anchor.current,current=anchorValue?anchorValue.now+performance.now()-anchorValue.at:Date.now();
   if(document.visibilityState!=="visible"||current<next)return;
   next=nextTrackingRefresh(startAt,current);void refresh(false);
  },1000);
  return()=>clearInterval(timer);
 },[startAt,refresh,simulated]);
 const courseData = data?.course;
 const course = useMemo(() => courseData ? buildCourse(courseData.points, courseData.distanceMeters) : null, [courseData]);
 const states = useMemo(() => course && data ? data.runners.map(runner => trackRunner(runner, data.checkpoints[runner.id] ?? [], course, now)) : [], [course, data, now]);

 async function write(payload: RaceWrite) {
  if(simulated)throw new Error("가상 데모에서는 실제 기록을 저장할 수 없습니다.");
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error?.message ?? "저장하지 못했습니다.");
  await load();
 }
 return <div className="mt-4 space-y-4 text-zinc-900">
  <header className="border-b border-zinc-200 p-4"><p className="text-sm font-bold text-zinc-600">대회 선수 추적 · 계측 기반 예측</p><h1 className="mt-2 break-words text-2xl font-black sm:text-3xl">{title}</h1>{data?.course&&<p className="mt-2 text-sm text-zinc-500">{data.course.name} · {new Date(data.course.startAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} 출발</p>}{!data?.course && <p className="mt-3 text-sm leading-6">계측 기록으로 계산한 예상 위치입니다. GPS 실측 위치가 아닙니다.</p>}</header>
  <div className="flex items-center justify-between gap-3 px-1"><p className="min-w-0 text-xs leading-5 text-zinc-500">{data ? `마지막 수신: ${new Date(data.serverNow).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} · 출발 후 3분마다 갱신` : "추적 정보를 불러오는 중입니다."}</p><button className="min-h-11 shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40" aria-label="새로고침" aria-describedby={coolingDown?"refresh-wait":undefined} disabled={refreshing||coolingDown} onClick={() => void refresh(true)}>{refreshing ? "갱신 중…" : coolingDown?<span id="refresh-wait">{cooldownSeconds}초 후 갱신 가능</span>:"새로고침"}</button></div>
  {simulation?.controls}
  {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">{error}{data && " 마지막 수신 위치를 유지하고 있습니다."}</p>}
  {data && !course && <p className="rounded-2xl border p-5">코스가 아직 등록되지 않았습니다. 운영진이 공식 거리와 코스 파일을 등록하면 추적이 시작됩니다.</p>}
  {data && <nav aria-label="추적 화면" className="tracking-view-nav">
   {([["overview","대회 현황"],["runner","선수 기록"],["cheer","응원 지점"]] as const).map(([key,label])=>management?<Link key={key} href={basePath+(key==="overview"?"":"?view="+key)} className="tracking-view-choice">{label}</Link>:<button key={key} type="button" onClick={()=>setPane(key)} aria-label={label} aria-pressed={pane===key} className="tracking-view-choice">{label}</button>)}
   {(data.canManage||data.canRegisterEntries)&&<Link href={basePath+"/entries"} aria-current={pane==="entries"?"page":undefined} className="tracking-view-choice">선수 등록</Link>}
   {data.canManage&&<Link href={basePath+"/admin"} aria-current={pane==="admin"?"page":undefined} className="tracking-view-choice">관리자</Link>}
  </nav>}
  {management&&!!data?.courses?.length&&<nav aria-label="대회 종목" className="tracking-course-nav">{data.courses.map(c=><Link key={c.raceId} href={`/tracking/${c.raceId}/${pane}`} aria-current={c.raceId===data.raceId?"page":undefined} className="tracking-course-choice">{c.name} · {c.distanceMeters/1000}km</Link>)}</nav>}
  {course && data && !management && <LiveTrackingView key={data.raceId??scheduleId} data={data} course={course} states={states} selectedId={selection} onSelect={setSelection} now={now} onCourseSelect={simulation?id=>{setPane("overview");setSelection("");simulation.onCourseSelect(id);}:undefined} activePane={pane as "overview"|"runner"|"cheer"} onPaneChange={setPane} showNavigation={false} simulationSnapshots={simulation?.allSnapshots} onRunnerCourseSelect={simulation?(id,runnerId)=>{setPane(runnerId?"runner":"overview");setSelection(runnerId??"");simulation.onCourseSelect(id);}:undefined}/> }
  {pane==="entries"&&data&&(data.canManage||data.canRegisterEntries)&&<section aria-label="선수 등록 페이지" className="space-y-5">
   <RaceForms data={data} write={write} mode="entries"/>
   <RunnerStatusList states={states}/>
  </section>}
  {data?.timing&&<p role="status" className="rounded-xl border border-zinc-200 p-3 text-xs leading-5">기록 연동{data.timing.collectionMode==="public-page"?" · 공개 페이지":""}: {data.timing.collectionMode!=="public-page"&&!data.timing.credentialsReady?"API 인증 설정 필요":!data.timing.enabled?"중지":!data.timing.courseCode?"현재 종목 연결 필요":data.timing.status==="synced"?"수집 응답 확인":data.timing.status==="partial"?"일부 기록 확인 필요":data.timing.status==="auth-required"?"기록 페이지 접근 제한":data.timing.status==="rate-limit"?"제공처 요청 제한":data.timing.status==="error"?"연결 확인 필요":"계측 수집 대기"}{data.timing.lastSyncedAt&&` · 최근 수집 ${new Date(data.timing.lastSyncedAt).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul"})}`}</p>}
  {pane==="admin"&&data?.canManage&&<TimingSourcePanel key={scheduleId} raceId={scheduleId} courseName={data.course?.name} courses={data.courses} timing={data.timing} onSaved={load}/>}
  {pane==="admin"&&data?.canManage && <section aria-label="실제 추적 준비 상태" className="rounded-2xl border border-zinc-200 bg-white p-4">
   <h2 className="text-sm font-bold">실제 추적 준비 상태</h2>
   <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
    <li className="rounded-xl bg-zinc-50 p-3">{course ? "✓" : "○"} 코스 {course ? "등록 완료" : "등록 필요"}</li>
    <li className="rounded-xl bg-zinc-50 p-3">{data.runners.length ? "✓" : "○"} 출전 선수 {data.runners.length}명</li>
    <li className="rounded-xl bg-zinc-50 p-3">{Object.values(data.checkpoints).some(records => records.length) ? "✓" : "○"} 계측 기록 {Object.values(data.checkpoints).reduce((sum, records) => sum + records.length, 0)}개</li>
   </ul>
   <p className="mt-3 text-xs leading-5 text-zinc-600">{!data.runners.length ? "다음 단계: 선수 등록 탭에서 이름과 배번호를 등록해주세요." : !Object.values(data.checkpoints).some(records => records.length) ? "다음 단계: 실제 확인한 START 또는 계측소 통과 기록을 입력해주세요. 현재 위치는 예정 출발과 그룹 페이스 기준입니다." : "계측 기록이 연결되어 있습니다. 다른 기기에서 최근 계측 기록이 반영되는지 확인해주세요."}</p>
   <p className="mt-2 text-xs leading-5 text-zinc-500">화면 기록은 출발 후 3분마다 갱신 · 수동 갱신은 최소 1분 간격 · 공개 기록 자동 수집은 종목 연결 후 동작 · GPS 위치 아님</p>
  </section>}
  {pane==="admin"&&data?.canManage && data.eventId && <details className="rounded-2xl border border-zinc-200 p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">같은 대회에 종목 추가</summary><p className="text-sm text-zinc-500">종목마다 별도의 거리·출발 시간·GPX를 등록합니다.</p><RaceRegistrationForm parentRaceId={data.eventId} eventName={data.title}/></details>}

  {pane==="admin"&&data?.canManage&&<RaceForms data={data} write={write} mode="admin"/>}
 </div>;
}

function RunnerStatusList({states}:{states:TrackingState[]}){
 return <section aria-label="등록 선수 현재 상태" className="rounded-2xl border border-zinc-200 p-4"><h2 className="text-lg font-bold">등록 선수 현재 상태 · {states.length}명</h2><ul className="mt-3 divide-y divide-zinc-200">{states.map(s=><li key={s.runner.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><strong>{s.runner.name}</strong><p className="text-sm text-zinc-500">#{s.runner.bib} · {s.runner.groupName??"그룹 미지정"}</p></div><div className="text-right text-sm"><strong>{trackingStatusLabel(s)} · {(s.distanceMeters/1000).toFixed(1)}km</strong><p className="text-zinc-500">{s.lastCheckpoint?`최근 계측 ${s.lastCheckpoint.name} · ${new Date(s.lastCheckpoint.passedAt).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})}`:"첫 계측 대기 중"}</p>{s.runner.timingStatus==="error"&&<p className="mt-1 max-w-md text-amber-900">{s.runner.timingMessage}</p>}</div></li>)}</ul>{!states.length&&<p className="mt-4 text-sm text-zinc-500">등록된 선수가 없습니다. 위에서 첫 선수를 등록해주세요.</p>}</section>;
}

function RaceForms({ data, write, mode }: { data: RaceSnapshot; write: (payload: RaceWrite) => Promise<void>; mode:"entries"|"admin" }) {
 const [message, setMessage] = useState("");
 const [busy, setBusy] = useState(false);
 const [points, setPoints] = useState<Coordinate[] | null>(null);
 const [fileName, setFileName] = useState("");
 const [entryChoice, setEntryChoice] = useState("");
 const [editingEntry, setEditingEntry] = useState("");
 const editRunner = data.runners.find(r=>r.id===editingEntry);
 const chosenEntry = entryChoice || data.entries[0]?.entryId || "";
 async function submit(event: FormEvent<HTMLFormElement>, payload: (form: FormData) => RaceWrite) {
  event.preventDefault(); if (busy) return;
  setBusy(true); setMessage("");
  try { const request=payload(new FormData(event.currentTarget));await write(request);if(request.action==="entry-delete"||request.action==="entry-move")setEditingEntry("");setMessage("저장했습니다."); }
  catch(e) { setMessage(e instanceof Error ? e.message : "저장하지 못했습니다."); }
  finally { setBusy(false); }
 }
 const date = (value: FormDataEntryValue | null) => { const d = new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error("통과 시각을 입력해주세요."); return d.toISOString(); };
 return <section aria-label={mode==="entries"?"선수 등록":"코스와 계측 관리"} className="space-y-4 border-t border-zinc-100 p-4 sm:p-5">
  <h2 className="text-xl font-bold">{mode==="entries" ? "선수 등록" : "코스와 계측 관리"}</h2>
  <p className="text-sm text-zinc-600">{mode==="entries"?"이름·배번호·그룹을 입력한 뒤 선수 등록 버튼을 눌러주세요. 회원 계정 없이 등록할 수 있습니다.":"코스·그룹과 수동 계측 기록을 관리합니다. 선수 추가는 선수 등록 탭을 이용해주세요."}</p>
  {message && <p role="status" className="rounded-xl bg-zinc-100 p-3 text-sm">{message}</p>}
  {mode==="admin" && data.canManage && !data.courseLocked && <form className="space-y-3 rounded-xl bg-zinc-50 p-4" onSubmit={e => void submit(e, f => { if (!points) throw new Error("코스 파일을 선택해주세요."); return { action: "course", name: String(f.get("name")), distanceMeters: Number(f.get("distance"))*1000, startAt: date(f.get("start")), points }; })}>
   <h3 className="font-bold">코스 설정</h3><p className="text-xs text-zinc-500">선수 등록 후에는 코스·출발 시각을 변경할 수 없습니다. 공식 거리와 좌표 경로를 확인해주세요.</p>
   <label className="block text-sm">코스 이름<input required maxLength={60} name="name" defaultValue={data.course?.name ?? ""} className={inputClass}/></label>
   <label className="block text-sm">공식 거리 (km)<input required type="number" min={1} max={100} step="0.001" name="distance" defaultValue={data.course ? data.course.distanceMeters/1000 : 42.195} className={inputClass}/></label>
   <label className="block text-sm">예정 출발 시각 (기기 시간대)<input required type="datetime-local" step={1} name="start" className={inputClass}/></label>
   <label className="block text-sm">공식 코스 파일 (GPX / GeoJSON)<input required type="file" accept=".gpx,.geojson,.json" className={inputClass} onChange={async e => { setPoints(null); setFileName(""); const file = e.target.files?.[0]; if (!file) return; try { if (file.size>2000000) throw new Error("코스 파일은 2MB 이하로 선택해주세요."); const source = await file.text(); const c = file.name.toLowerCase().endsWith(".gpx") ? courseFromGPX(source) : courseFromGeoJSON(JSON.parse(source)); if (c.points.length>20000) throw new Error("코스 좌표는 최대 20,000개입니다."); setPoints(c.points); setFileName(`${file.name} · ${c.points.length}개 좌표 · 좌표 거리 ${(c.measuredMeters/1000).toFixed(3)}km`); setMessage(""); } catch(e) { setMessage(e instanceof Error ? e.message : "파일을 읽지 못했습니다."); } }}/></label>
   {fileName && <p className="text-xs text-zinc-600">{fileName}</p>}<button disabled={busy || !points} className={buttonClass}>코스 저장</button>
  </form>}
  {mode==="admin"&&data.canManage&&<TrackingGroupManager data={data} write={write}/>}
  {mode==="entries"&&!data.groups?.length&&<p className="text-sm text-zinc-500">그룹 없이 등록할 수 있습니다. 그룹 미지정은 기본 6:00/km로 예측하다가 실제 구간 계측이 들어오면 실측 페이스로 전환합니다.</p>}
  {mode==="entries" && data.course && <form className="space-y-3 rounded-xl bg-zinc-50 p-4" onSubmit={e => void submit(e, f => ({ action:"entry", runnerName:String(f.get("runnerName")), ...(editingEntry ? {entryId:editingEntry} : {}), bib:String(f.get("bib")), targetPaceSeconds:null,groupId:String(f.get("group"))||null }))}><h3 className="font-bold">선수 정보 입력</h3><label className="block text-sm">등록 구분<select value={editingEntry} onChange={e=>setEditingEntry(e.target.value)} className={inputClass}><option value="">새 선수 등록</option>{data.runners.map(r=><option key={r.id} value={r.id}>{r.name} · #{r.bib} 수정</option>)}</select></label><label className="block text-sm">선수 이름<input key={editingEntry+"name"} required name="runnerName" maxLength={50} defaultValue={editRunner?.name??""} placeholder="선수 이름을 입력해주세요" className={inputClass}/></label><label className="block text-sm">배번호<input key={editingEntry+"bib"} defaultValue={editRunner?.bib??""} required name="bib" maxLength={20} pattern="[A-Za-z0-9-]+" className={inputClass}/></label><label className="block text-sm">소속 그룹<select key={editingEntry+"group"} name="group" defaultValue={data.groups?.find(g=>g.name===editRunner?.groupName)?.groupId??""} className={inputClass}><option value="">그룹 미지정 · 초기 6:00/km 예측</option>{data.groups?.map(g=><option key={g.groupId} value={g.groupId}>{g.name} · {Math.floor(g.paceSeconds/60)}:{String(g.paceSeconds%60).padStart(2,"0")}/km</option>)}</select></label><p className="text-xs text-zinc-500">계측 기록이 있는 선수의 배번호·그룹 수정은 잠깁니다. 잘못된 선수는 아래에서 삭제하거나 다른 코스로 옮겨 등록할 수 있습니다.</p><button disabled={busy} className={buttonClass}>{editingEntry?"선수 정보 수정":"선수 등록"}</button></form>}
  {mode==="entries"&&editRunner&&<section aria-label="선수 삭제와 코스 변경" className="space-y-4 rounded-xl border border-zinc-200 p-4"><h3 className="font-bold">{editRunner.name} · #{editRunner.bib} 등록 정정</h3><p className="text-sm text-zinc-600">삭제한 선수와 기존 계측은 보관되며 화면과 수집 대상에서 제외됩니다. 코스를 옮기면 새 코스에서 계측을 다시 수집합니다.</p>
   <form onSubmit={e=>void submit(e,()=>({action:"entry-delete",entryId:editingEntry}))}><button disabled={busy} className={buttonClass}>선수 삭제</button></form>
   {!!data.courses?.some(c=>c.raceId!==data.raceId)&&<form className="space-y-3" onSubmit={e=>void submit(e,f=>({action:"entry-move",entryId:editingEntry,courseId:String(f.get("destination")),groupId:null}))}><label className="block text-sm">이동할 코스<select required name="destination" className={inputClass}>{data.courses.filter(c=>c.raceId!==data.raceId).map(c=><option key={c.raceId} value={c.raceId}>{c.name} · {c.distanceMeters/1000}km</option>)}</select></label><p className="text-xs text-zinc-500">이동한 코스에서는 그룹 미지정으로 등록됩니다. 해당 코스의 선수 등록 페이지에서 그룹을 지정할 수 있습니다.</p><button disabled={busy} className={buttonClass}>코스 변경</button></form>}
  </section>}
  {mode==="admin" && data.canManage && data.entries.length>0 && <div className="space-y-4 rounded-xl bg-zinc-50 p-4"><label className="block text-sm">계측 대상 선수<select value={chosenEntry} onChange={e => setEntryChoice(e.target.value)} className={inputClass}>{data.entries.map(e => <option key={e.entryId} value={e.entryId}>{data.runners.find(r => r.id===e.entryId)?.name} · BIB {e.bib}</option>)}</select></label>
   <form className="space-y-3" onSubmit={e => void submit(e,f => ({ action:"checkpoint", entryId:chosenEntry, name:String(f.get("name")), distanceMeters:Number(f.get("distance"))*1000, passedAt:date(f.get("passed")) }))}><h3 className="font-bold">통과 기록 입력</h3><p className="text-xs text-zinc-500">실제 확인한 기록만 입력해주세요. START는 0km, FINISH는 공식 거리입니다. 기록은 거리·시각 순서대로 입력하며, 저장 후 이 화면에서는 변경할 수 없습니다.</p><label className="block text-sm">지점 이름<input required maxLength={40} name="name" placeholder="START / 5K / FINISH" className={inputClass}/></label><label className="block text-sm">통과 거리 (km)<input required type="number" name="distance" min={0} max={data.course!.distanceMeters/1000} step="0.001" className={inputClass}/></label><label className="block text-sm">통과 시각 (기기 시간대)<input required type="datetime-local" step={1} name="passed" className={inputClass}/></label><button disabled={busy} className={buttonClass}>통과 기록 저장</button></form>
   <form className="space-y-3 border-t pt-4" onSubmit={e => void submit(e, f => ({ action:"status", entryId:chosenEntry, status:String(f.get("status")) as "running"|"dnf"|"dns" }))}><h3 className="font-bold">출전 상태</h3><select name="status" aria-label="출전 상태" className={inputClass}><option value="running">주행</option><option value="dnf">중도 포기 (DNF)</option><option value="dns">미출발 (DNS)</option></select><button disabled={busy} className={buttonClass}>상태 저장</button></form>
  </div>}
 </section>;
}
