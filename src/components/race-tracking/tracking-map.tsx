"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { positionAtDistance } from "@/lib/race-tracking/course";
import type { Course, TrackingState } from "@/lib/race-tracking/types";
import "leaflet/dist/leaflet.css";

type Props = { course: Course; runners: TrackingState[]; selectedId: string; onSelect: (id: string) => void; revision: number; compact?: boolean };
const colors = ["#059669", "#2563eb", "#d97706", "#9333ea", "#db2777", "#64748b"];

export default function TrackingMap({ course, runners, selectedId, onSelect, revision, compact = false }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const tileLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const [showBackground, setShowBackground] = useState(true);
  const markers = useRef(new Map<string, Leaflet.CircleMarker>());
  const currentDistances = useRef(new Map<string, number>());
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const selection = useRef(onSelect);
  const previousRevision = useRef(revision);
  useEffect(() => { selection.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      leafletRef.current = L;
      const map = L.map(container.current, { scrollWheelZoom: false, zoomSnap: 0.25 });
      mapRef.current = map;
      tileLayerRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on("tileerror", () => { if (!disposed) setTileError(true); });
      L.polyline(course.points.map(p => [p.latitude, p.longitude] as [number, number]), { color: "#ffffff", weight: 10, opacity: 1 }).addTo(map);
      const line = L.polyline(course.points.map(p => [p.latitude, p.longitude] as [number, number]), {
        color: "#17465c", weight: 5, opacity: 1,
      }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [35, 35] });
      let width = container.current.clientWidth;
      resizeObserver = new ResizeObserver(entries => {
        const nextWidth = entries[0]?.contentRect.width ?? width;
        if (Math.abs(nextWidth - width) > 1) {
          width = nextWidth;
          map.invalidateSize({ pan: false });
          map.fitBounds(line.getBounds(), { padding: [25, 25], animate: false });
        }
      });
      resizeObserver.observe(container.current);
      for (let distance = 5000; distance < course.distanceMeters; distance += 5000) {
        const point = positionAtDistance(course, distance);
        L.circleMarker([point.latitude, point.longitude], { radius: 4, color: "#17465c", weight: 2, fillColor: "#ffffff", fillOpacity: 1 })
          .addTo(map).bindTooltip(String(distance / 1000) + "K", { permanent: true, direction: "bottom", className: "tracking-distance-label", offset: [0, 3] });
      }
      const start = course.points[0], finish = course.points[course.points.length - 1];
      L.circleMarker([start.latitude, start.longitude], { radius: 6, color: "#18181b" }).addTo(map).bindTooltip("START");
      L.circleMarker([finish.latitude, finish.longitude], { radius: 6, color: "#18181b" }).addTo(map).bindTooltip("FINISH");
      setReady(true);
    }).catch(() => { if (!disposed) setMapError(true); });
    const storedMarkers = markers.current;
    const distances = currentDistances.current;
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove(); mapRef.current = null; tileLayerRef.current = null;
      storedMarkers.clear(); distances.clear();
    };
  }, [course]);

  useEffect(() => {
    const map = mapRef.current, layer = tileLayerRef.current;
    if (!ready || !map || !layer) return;
    if (showBackground) layer.addTo(map); else layer.remove();
  }, [ready, showBackground, course]);

  useEffect(() => {
    const map = mapRef.current, L = leafletRef.current;
    if (!ready || !map || !L) return;
    const starts = new Map<string, number>();
    for (const [index, state] of runners.entries()) {
      starts.set(state.runner.id, currentDistances.current.get(state.runner.id) ?? state.distanceMeters);
      let marker = markers.current.get(state.runner.id);
      if (!marker) {
        marker = L.circleMarker([state.position.latitude, state.position.longitude], {
          color: "#ffffff", fillColor: colors[index % colors.length], fillOpacity: 0.95,
          radius: 8, weight: 3,
        }).addTo(map).on("click", () => selection.current(state.runner.id));
        const label = document.createElement("span");
        label.textContent = state.runner.name;
        marker.bindTooltip(label, { direction: "top", offset: [0, -8], opacity: 1 });
        markers.current.set(state.runner.id, marker);
      }
      marker.setStyle({ radius: state.runner.id === selectedId ? 13 : 9,
        color: state.runner.id === selectedId ? "#111827" : "#ffffff",
        weight: state.runner.id === selectedId ? 4 : 3,
        fillOpacity: ["dns", "dnf"].includes(state.status) ? 0.5 : 1 });
      if (state.runner.id === selectedId) { marker.bringToFront(); marker.openTooltip(); } else marker.closeTooltip();
    }
    const liveIds = new Set(runners.map(s => s.runner.id));
    for (const [id, marker] of markers.current) {
      if (!liveIds.has(id)) { marker.remove(); markers.current.delete(id); currentDistances.current.delete(id); }
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    let frame = 0;
    // A seek/reset snaps immediately; timing corrections follow distance along the course.
    const duration = reducedMotion || previousRevision.current !== revision ? 0 : 900;
    previousRevision.current = revision;
    const animate = (time: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (time - began) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      for (const state of runners) {
        const from = starts.get(state.runner.id)!;
        const distance = from + (state.distanceMeters - from) * eased;
        const position = positionAtDistance(course, distance);
        markers.current.get(state.runner.id)?.setLatLng([position.latitude, position.longitude]);
        currentDistances.current.set(state.runner.id, distance);
      }
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [course, ready, runners, selectedId, revision]);

  return <div className="tracking-map relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
    <div ref={container} style={{ backgroundColor: "#f4f4f5" }} className={compact ? "h-[58svh] min-h-[350px] w-full sm:h-[640px]" : "h-[62svh] min-h-[380px] w-full sm:h-[640px]"} aria-label="대회 코스와 선수 예상 위치 지도" />
    <button type="button" onClick={() => mapRef.current?.fitBounds(course.points.map(p => [p.latitude, p.longitude] as [number, number]), { padding: [35, 35] })} className="absolute right-3 top-3 z-[1000] min-h-11 rounded-full border border-zinc-200 bg-white/95 px-4 py-2 text-sm font-bold text-slate-800 shadow-sm">코스 전체</button>
    <button type="button" aria-pressed={showBackground} onClick={() => setShowBackground(value => !value)} className="absolute right-3 top-16 z-[1000] min-h-11 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm">{showBackground ? "배경 지도 숨기기" : "배경 지도 표시"}</button>
    {!ready && <p className="absolute inset-x-0 top-4 z-[1000] mx-4 rounded-xl bg-white p-3 text-sm text-zinc-700">{mapError ? "지도를 불러오지 못했습니다. 아래 선수 목록을 이용해주세요." : "지도를 불러오는 중입니다…"}</p>}
    {showBackground && tileError && <p role="status" className="absolute inset-x-0 bottom-8 z-[1000] mx-4 rounded-xl bg-white p-3 text-sm text-zinc-700">배경 지도 연결이 지연됩니다. 코스와 선수 목록은 계속 확인할 수 있습니다.</p>}
  </div>;
}
