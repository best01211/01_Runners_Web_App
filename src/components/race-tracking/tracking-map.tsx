"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { positionAtDistance } from "@/lib/race-tracking/course";
import type { Coordinate, Course, TrackingState } from "@/lib/race-tracking/types";
import "leaflet/dist/leaflet.css";

type ExtraCourse={id:string;name:string;course:Course};
const emptyCourses:ExtraCourse[]=[];
type Props = { additionalCourses?:ExtraCourse[];runnerCourses?:Record<string,Course>;course: Course; runners: TrackingState[]; selectedId: string; onSelect: (id: string) => void; revision: number; compact?: boolean; onPickPoint?: (point:Coordinate)=>void; cheerDistance?:number|null; expanded?:boolean };
const colors = ["#059669", "#2563eb", "#d97706", "#9333ea", "#db2777", "#64748b"];
// GridLayer.redraw() in Leaflet 1.9 uses map.getZoom() verbatim. Fractional
// fitBounds zooms would become invalid OSM URLs (e.g. /12.5/x/y.png).
// Reattaching runs Leaflet's normal _setView path, which rounds the tile zoom.
function reloadBackground(map:Leaflet.Map,layer:Leaflet.TileLayer) {
  if(map.hasLayer(layer))map.removeLayer(layer);
  layer.addTo(map);
}


export default function TrackingMap({ course: incomingCourse, runners, selectedId, onSelect, revision, compact = false, onPickPoint,cheerDistance,expanded=false,additionalCourses: incomingAdditionalCourses=emptyCourses,runnerCourses }: Props) {
  // API refreshes may return fresh objects with identical coordinates. Only a
  // changed route should rebuild the map; runner updates keep tiles and view.
  const courseDefinition=JSON.stringify(incomingCourse);
  const additionalDefinition=JSON.stringify(incomingAdditionalCourses);
  const course=useMemo(()=>JSON.parse(courseDefinition) as Course,[courseDefinition]);
  const additionalCourses=useMemo(()=>JSON.parse(additionalDefinition) as ExtraCourse[],[additionalDefinition]);
  const geometry=useMemo(()=>({course,additionalCourses}),[course,additionalCourses]);
  const pick=useRef(onPickPoint);
  useEffect(()=>{pick.current=onPickPoint;},[onPickPoint]);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const tileLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const [showBackground, setShowBackground] = useState(true);
  const background = useRef(showBackground);
  useEffect(() => { background.current = showBackground; }, [showBackground]);
  const markers = useRef(new Map<string, Leaflet.CircleMarker>());
  const currentDistances = useRef(new Map<string, number>());
  const [readyCourse, setReadyCourse] = useState<typeof geometry|null>(null);
  const ready=readyCourse===geometry;
  const viewChanging=useRef(false);
  const [viewRevision,setViewRevision]=useState(0);
  const [tileError, setTileError] = useState(false);
  const [tilesLoading,setTilesLoading]=useState(true);
  const tileFailures=useRef(new Set<string>());
  const tileLoadingTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [mapError, setMapError] = useState(false);
  const selection = useRef(onSelect);
  const previousRevision = useRef(revision);
  useEffect(() => { selection.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    let layoutFrame=0;
    let retryTimer:ReturnType<typeof setTimeout>|undefined;
    let automaticRetries=0;
    tileFailures.current.clear();
    let resizeObserver: ResizeObserver | undefined;
    let removePointerListener:(()=>void)|undefined;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      leafletRef.current = L;
      const element=container.current;
      const map = L.map(element, {
        fadeAnimation:false,zoomAnimation:false,scrollWheelZoom:false,zoomSnap:0.25,maxZoom:19,touchZoom:true,bounceAtZoomLimits:false,
        dragging:!window.matchMedia("(pointer: coarse)").matches,
        renderer:L.svg({padding:0.5}),
      });
      // One finger scrolls the document. Leaflet's two-touch handler owns pinch/pan.
      const pointerDown=(event:PointerEvent)=>{
        if(event.pointerType==="touch")map.dragging.disable();
        else map.dragging.enable();
      };
      element.addEventListener("pointerdown",pointerDown,true);
      removePointerListener=()=>element.removeEventListener("pointerdown",pointerDown,true);
      viewChanging.current=false;
      map.on("zoomstart",()=>{viewChanging.current=true;});
      map.on("zoomend",()=>{
        viewChanging.current=false;
        if(!disposed)setViewRevision(value=>value+1);
      });
      mapRef.current = map;
      map.on("click",(event:Leaflet.LeafletMouseEvent)=>pick.current?.({latitude:event.latlng.lat,longitude:event.latlng.lng}));
      tileLayerRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        updateWhenIdle:false,updateWhenZooming:true,keepBuffer:3,updateInterval:100,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on("loading",()=>{if(disposed)return;setTilesLoading(true);clearTimeout(tileLoadingTimer.current);tileLoadingTimer.current=setTimeout(()=>{if(!disposed&&background.current)setTileError(true);},10000);})
        .on("load",()=>{clearTimeout(tileLoadingTimer.current);if(!disposed){setTilesLoading(false);setTileError(tileFailures.current.size>0);}})
        .on("tileerror",(event:Leaflet.TileErrorEvent)=>{if(disposed)return;tileFailures.current.add(`${event.coords.z}/${event.coords.x}/${event.coords.y}`);setTileError(true);
          if(automaticRetries<2&&!retryTimer){retryTimer=setTimeout(()=>{retryTimer=undefined;if(disposed||!background.current)return;automaticRetries++;tileFailures.current.clear();if(tileLayerRef.current)reloadBackground(map,tileLayerRef.current);},1500);}
        })
        .on("tileload",(event:Leaflet.TileEvent)=>{if(disposed)return;tileFailures.current.delete(`${event.coords.z}/${event.coords.x}/${event.coords.y}`);setTileError(tileFailures.current.size>0);})
        .on("tileunload",(event:Leaflet.TileEvent)=>{tileFailures.current.delete(`${event.coords.z}/${event.coords.x}/${event.coords.y}`);});
      // Attach to each new map immediately, including React's effect remounts.
      if (background.current) tileLayerRef.current.addTo(map);
      L.polyline(course.points.map(p => [p.latitude, p.longitude] as [number, number]), { color: "#ffffff", weight: 10, opacity: 1,noClip:true,className:"tracking-course-outline" }).addTo(map);
      const line = L.polyline(course.points.map(p => [p.latitude, p.longitude] as [number, number]), {
        color: "#17465c", weight: 5, opacity: 1,noClip:true,className:"tracking-course-line",
      }).addTo(map);
      const bounds=line.getBounds();
      for(const [index,extra] of additionalCourses.entries()){
        const points=extra.course.points.map(p=>[p.latitude,p.longitude] as [number,number]);
        L.polyline(points,{color:"#fff",weight:9,opacity:1,noClip:true}).addTo(map);
        const extraLine=L.polyline(points,{color:["#c2410c","#7e22ce","#047857","#1d4ed8"][index%4],weight:4,opacity:1,noClip:true,className:"tracking-additional-course-line"}).addTo(map).bindTooltip(extra.name,{sticky:true});bounds.extend(extraLine.getBounds());
        const finish=points[points.length-1];L.circleMarker(finish,{radius:6,color:["#c2410c","#7e22ce","#047857","#1d4ed8"][index%4],fillColor:"#fff",fillOpacity:1,weight:3}).addTo(map).bindTooltip(`${extra.name} FINISH`);
      }
      map.fitBounds(bounds, { padding: [35, 35] });
      let width = element.clientWidth,height=element.clientHeight;
      resizeObserver = new ResizeObserver(entries => {
        const nextWidth = entries[0]?.contentRect.width ?? width;
        const nextHeight=entries[0]?.contentRect.height??height;
        if (Math.abs(nextWidth - width) > 1||Math.abs(nextHeight-height)>1) {
          width = nextWidth;height=nextHeight;
          cancelAnimationFrame(layoutFrame);
          layoutFrame=requestAnimationFrame(()=>{if(disposed)return;map.invalidateSize({pan:true,animate:false});if(background.current){const layer=tileLayerRef.current;if(layer)reloadBackground(map,layer);}});
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
      setTileError(false);setMapError(false);setReadyCourse(geometry);
    }).catch(() => { if (!disposed) setMapError(true); });
    const storedMarkers = markers.current;
    const distances = currentDistances.current;
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      cancelAnimationFrame(layoutFrame);clearTimeout(retryTimer);clearTimeout(tileLoadingTimer.current);
      removePointerListener?.();
      mapRef.current?.remove(); mapRef.current = null; tileLayerRef.current = null;
      storedMarkers.clear(); distances.clear();
    };
  }, [course,additionalCourses,geometry]);

  useEffect(() => {
    const map = mapRef.current, layer = tileLayerRef.current;
    if (!ready || !map || !layer) return;
    if (showBackground) {if(!map.hasLayer(layer))layer.addTo(map);} else {layer.remove();clearTimeout(tileLoadingTimer.current);}
  }, [ready, showBackground, geometry]);

  useEffect(() => {
    if (!ready) return;
    // Wait until the expanded/collapsed container has its final layout, then
    // refresh tile coverage as well as Leaflet's cached container dimensions.
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current, layer = tileLayerRef.current;
      if (!map || !layer) return;
      map.invalidateSize({ pan: true, animate: false });
      if (background.current) {
        reloadBackground(map,layer);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, ready, geometry]);

  useEffect(() => {
    const map = mapRef.current, L = leafletRef.current;
    if (!ready || !map || !L || viewChanging.current) return;
    const starts = new Map<string, number>();
    for (const [index, state] of runners.entries()) {
      starts.set(state.runner.id, currentDistances.current.get(state.runner.id) ?? state.distanceMeters);
      let marker = markers.current.get(state.runner.id);
      if (!marker) {
        marker = L.circleMarker([state.position.latitude, state.position.longitude], {
          color: "#ffffff", fillColor: colors[index % colors.length], fillOpacity: 0.95,
          radius: 8, weight: 3,className:"tracking-runner-marker",
        }).addTo(map).on("click", () => { if(!pick.current)selection.current(state.runner.id); });
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
      // CircleMarker projects against the new zoom while SVG is still transformed
      // from its previous zoom. Let Leaflet finish that transform before updating.
      // zoomend restarts this effect with the latest runner data and saved distances.
      if(viewChanging.current)return;
      const progress = duration === 0 ? 1 : Math.min(1, (time - began) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      for (const state of runners) {
        const from = starts.get(state.runner.id)!;
        const distance = from + (state.distanceMeters - from) * eased;
        const position = positionAtDistance(runnerCourses?.[state.runner.id]??course, distance);
        markers.current.get(state.runner.id)?.setLatLng([position.latitude, position.longitude]);
        currentDistances.current.set(state.runner.id, distance);
      }
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [course, ready, runners, selectedId, revision,viewRevision,runnerCourses]);

  useEffect(()=>{
    const map=mapRef.current,L=leafletRef.current;
    if(!ready||!map||!L||cheerDistance==null)return;
    const p=positionAtDistance(course,cheerDistance);
    const marker=L.circleMarker([p.latitude,p.longitude],{radius:12,color:"#22261f",fillColor:"#fff",fillOpacity:1,weight:4}).addTo(map).bindTooltip(`응원 ${(cheerDistance/1000).toFixed(1)}km`,{permanent:true,direction:"top"});
    return ()=>{marker.remove();};
  },[ready,course,cheerDistance]);

  return <div className="tracking-map relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
    <div className={expanded?"h-[72svh] min-h-[380px] w-full":compact ? "h-[320px] w-full sm:h-[400px]" : "h-[62svh] min-h-[380px] w-full sm:h-[640px]"}>
      {/* Leaflet owns this element's classes. React only resizes its parent. */}
      <div ref={container} style={{ height:"100%",width:"100%",backgroundColor:"#f4f4f5",touchAction:"pan-y" }} aria-label="대회 코스와 선수 예상 위치 지도" />
    </div>
    <button type="button" onClick={() => mapRef.current?.fitBounds([course,...additionalCourses.map(c=>c.course)].flatMap(c=>c.points.map(p => [p.latitude, p.longitude] as [number, number])), { padding: [35, 35] })} className="absolute right-3 top-3 z-[1000] min-h-11 rounded-full border border-zinc-200 bg-white/95 px-4 py-2 text-sm font-bold text-slate-800 shadow-sm">코스 전체</button>
    <button type="button" aria-pressed={showBackground} onClick={() => setShowBackground(value => !value)} className="absolute right-3 top-16 z-[1000] min-h-11 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm">{showBackground ? "배경 지도 숨기기" : "배경 지도 표시"}</button>
    <p className="pointer-events-none absolute bottom-2 left-3 z-[1000] rounded-lg bg-white/90 px-2 py-1 text-xs text-zinc-600">한 손가락: 화면 스크롤 · 두 손가락: 지도 이동·확대</p>
    {!ready && <p className="absolute inset-x-0 top-4 z-[1000] mx-4 rounded-xl bg-white p-3 text-sm text-zinc-700">{mapError ? "지도를 불러오지 못했습니다. 아래 선수 목록을 이용해주세요." : "지도를 불러오는 중입니다…"}</p>}
    {showBackground&&tilesLoading&&!tileError&&<p role="status" className="absolute bottom-8 left-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs">배경 지도 불러오는 중…</p>}
    {showBackground && tileError && <p role="status" className="absolute inset-x-0 bottom-8 z-[1000] mx-4 rounded-xl bg-white p-3 text-sm text-zinc-700">배경 지도를 불러오지 못한 구역이 있습니다. 코스와 선수는 계속 확인할 수 있습니다. <button type="button" className="ml-2 min-h-11 font-bold underline" onClick={()=>{tileFailures.current.clear();setTileError(false);setTilesLoading(true);if(mapRef.current&&tileLayerRef.current)reloadBackground(mapRef.current,tileLayerRef.current);}}>배경 지도 다시 불러오기</button></p>}
  </div>;
}
