"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackRunner } from "@/lib/race-tracking/engine";
import { DEMO_COURSE, DEMO_DURATION_SECONDS, DEMO_START, MockTimingProvider } from "@/lib/race-tracking/providers/mock";
import type { TrackingState } from "@/lib/race-tracking/types";

const TrackingMap = dynamic(() => import("./tracking-map"), {
  ssr: false, loading: () => <div className="flex h-[360px] items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 sm:h-[480px]">지도 준비 중…</div>,
});
const provider = new MockTimingProvider();
const statusLabels: Record<TrackingState["status"], string> = {
  "not-started": "출발 전", running: "주행 예상", stale: "계측 지연 · 추정 정지",
  "finish-pending": "완주 계측 대기", finished: "완주 계측", dnf: "중도 포기", dns: "미출발",
};
const confidenceLabels = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
const paceSourceLabels: Record<TrackingState["paceSource"], string> = {
  "target-time": "목표 기록", "target-pace": "목표 페이스", "pace-group": "페이스 그룹", default: "기본 페이스", timing: "실측 구간",
};
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 3600)}:${String(Math.floor(rounded / 60) % 60).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}
const paceLabel = (seconds: number) => {
  const value = Math.round(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}/km`;
};

export function TrackingDemo({ eventTitle }: { eventTitle?: string }) {
  const [elapsed, setElapsed] = useState(45 * 60);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState("mock-1");
  const [revision, setRevision] = useState(0);
  const elapsedRef = useRef(elapsed);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const anchor = { elapsed: elapsedRef.current, at: performance.now() };
    const timer = window.setInterval(() => {
      const next = Math.min(DEMO_DURATION_SECONDS, anchor.elapsed + (performance.now() - anchor.at) / 1000 * speed);
      elapsedRef.current = next; setElapsed(next);
      if (next >= DEMO_DURATION_SECONDS) setPlaying(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, speed, revision]);
  function seek(value: number) {
    elapsedRef.current = value; setElapsed(value); setRevision(value => value + 1);
  }
  const now = DEMO_START + elapsed * 1000;
  const states = useMemo(() => provider.getRunners(now).map(runner =>
    trackRunner(runner, provider.getCheckpoints(runner.bib, now), DEMO_COURSE, now)), [now]);
  const selected = states.find(state => state.runner.id === selectedId) ?? states[0];
  const checkpoints = provider.getCheckpoints(selected.runner.bib, now);
  const elapsedLabel = selected.status === "finished" ? selected.estimatedFinishSeconds : selected.elapsedSeconds;

  return <div className="mt-6 space-y-5 text-zinc-900">
    <header className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-sm font-bold text-amber-800">DEMO · 가상 계측 데이터</p>
      <h1 className="mt-1 text-xl font-black sm:text-2xl">{eventTitle ? `${eventTitle} · 추적 데모` : "서울레이스 21K 추적 데모"}</h1>
      <details className="mt-1 text-xs leading-5 text-zinc-500"><summary className="cursor-pointer">계측 기반 예상 위치 · 가상 선수 · 안내</summary><p className="mt-2">GPS 실측 위치가 아닙니다. 제공하신 서울레이스 GPX 경로를 사용하며, 선수·배번호·계측 기록·출발 시각은 가상입니다. 실제 회원 기록과 완주 통계에 저장되지 않습니다.</p></details>
      
    </header>
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="선수 지도" className="min-w-0">
        <TrackingMap course={DEMO_COURSE} runners={states} selectedId={selectedId} onSelect={setSelectedId} revision={revision} />
    <section aria-label="데모 재생 제어" className="rounded-2xl border border-zinc-200 bg-white p-3 mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-zinc-500">가상 대회 시각 (한국)</p><p className="text-lg font-bold tabular-nums">{new Date(now).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPlaying(value => !value)} disabled={elapsed >= DEMO_DURATION_SECONDS && !playing} className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white disabled:opacity-40">{playing ? "일시정지" : "재생"}</button>
          <button onClick={() => seek(0)} className="rounded-xl border px-4 py-2 font-semibold">처음으로</button>
          <label className="flex items-center gap-2 text-sm">속도<select aria-label="재생 속도" value={speed} onChange={event => setSpeed(Number(event.target.value))} className="rounded-xl border bg-white p-2">{[1, 10, 60].map(value => <option key={value} value={value}>{value}배</option>)}</select></label>
        </div>
      </div>
      <label className="mt-2 block text-xs font-semibold">출발 후 {formatDuration(elapsed)}<input type="range" min={0} max={DEMO_DURATION_SECONDS} step={30} value={Math.floor(elapsed)} onChange={event => seek(Number(event.target.value))} className="mt-1 w-full accent-slate-700" aria-label="가상 대회 진행 시각" /></label>
      {offline && <p role="status" className="mt-3 text-sm text-amber-800">네트워크 연결이 없습니다. Mock 계산은 계속되며 배경 지도가 표시되지 않을 수 있습니다.</p>}
    </section>
        <p className="mt-2 text-xs leading-5 text-zinc-500">서울레이스 GPX · 하프 거리 21.0975km 기준 시뮬레이션 · 코스 위 거리를 보간한 위치 · 미계측 45분 이후 추정 정지</p>
      </section>
      <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4" aria-label="선수 목록">
        <h2 className="font-bold">가상 참가자 {states.length}명</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto lg:block lg:space-y-2">{states.map(state => <button key={state.runner.id} onClick={() => setSelectedId(state.runner.id)} aria-pressed={state.runner.id === selectedId} className={`min-w-[190px] shrink-0 rounded-xl border p-3 text-left lg:w-full ${state.runner.id === selectedId ? "border-slate-700 bg-slate-50" : "border-zinc-200 bg-white"}`}>
          <span className="flex justify-between gap-2"><strong className="text-sm">{state.runner.name}</strong><span className="text-sm font-semibold tabular-nums">{(state.distanceMeters / 1000).toFixed(2)}km</span></span>
          <span className="mt-1 block text-xs text-zinc-500">BIB {state.runner.bib} · {statusLabels[state.status]}</span>
        </button>)}</div>
      </section>
    </div>
    <section aria-label="선택 선수 상세" className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-xl font-bold">{selected.runner.name}</h2><p className="mt-1 text-sm text-zinc-500">BIB {selected.runner.bib}</p></div><span className="self-start rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">{statusLabels[selected.status]}</span></div>
      <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Detail label="현재 예상 거리" value={`${(selected.distanceMeters / 1000).toFixed(2)} km`} />
        <Detail label="최근 페이스" value={paceLabel(selected.paceSeconds)} note={paceSourceLabels[selected.paceSource]} />
        <Detail label={selected.status === "finished" ? "가상 완주 기록" : "예상 완주 소요 시간"} value={formatDuration(selected.estimatedFinishSeconds)} note={selected.startSource === "measured" ? "실측 출발 기준" : "예정 출발 기준 · 넷타임 미확정"} />
        <Detail label="최근 계측" value={selected.lastCheckpoint?.name ?? "실측 없음"} note={selected.lastCheckpoint ? new Date(selected.lastCheckpoint.passedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "예정 출발 기준"} />
        <Detail label="마지막 실측 이후" value={selected.secondsSinceCheckpoint === null ? "실측 없음" : `${Math.floor(selected.secondsSinceCheckpoint / 60)}분`} />
        <Detail label="추정 신뢰도" value={`${confidenceLabels[selected.confidence]} (${selected.confidence})`} note="계측 최신성 지표" />
      </dl>
      <p className="mt-5 text-sm text-zinc-600">{selected.status === "finished" ? "완주 소요" : "출발 후 경과"} {formatDuration(elapsedLabel)} · {selected.paceSource === "timing" ? "최근 최대 3개 유효 실측 구간에 가중치를 적용합니다." : "유효한 실측 구간이 없어 목표 또는 기본 페이스를 사용합니다."}</p>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[340px] text-left text-sm"><caption className="pb-2 text-left font-bold">수신된 가상 계측 기록</caption><thead className="border-b text-zinc-500"><tr><th className="py-2">지점</th><th>통과 시각 (한국)</th><th>수신 지연</th></tr></thead><tbody>{checkpoints.map(checkpoint => <tr key={checkpoint.id} className="border-b border-zinc-100"><td className="py-2 font-semibold">{checkpoint.name}</td><td className="tabular-nums">{new Date(checkpoint.passedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}</td><td>{Math.round((Date.parse(checkpoint.receivedAt) - Date.parse(checkpoint.passedAt)) / 1000)}초</td></tr>)}</tbody></table>{checkpoints.length === 0 && <p className="mt-3 text-sm text-zinc-500">아직 수신된 계측 기록이 없습니다.</p>}</div>
    </section>
  </div>;
}
function Detail({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>{note && <dd className="mt-1 text-xs text-zinc-500">{note}</dd>}</div>;
}
