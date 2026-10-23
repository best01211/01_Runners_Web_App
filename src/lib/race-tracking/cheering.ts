import { distanceBetween, positionAtDistance } from "./course";
import type { Coordinate, Course, TrackingState } from "./types";

// Return all nearby course passages, not just the geographically nearest segment.
export function cheerCandidates(course: Course, point: Coordinate) {
 const scale=Math.cos(point.latitude*Math.PI/180);
 const candidates: {distanceMeters:number;gapMeters:number;position:Coordinate}[]=[];
 for(let i=1;i<course.points.length;i++){
  const a=course.points[i-1],b=course.points[i];
  const dx=(b.longitude-a.longitude)*scale,dy=b.latitude-a.latitude;
  const ratio=dx*dx+dy*dy ? Math.max(0,Math.min(1,((point.longitude-a.longitude)*scale*dx+(point.latitude-a.latitude)*dy)/(dx*dx+dy*dy))) : 0;
  const position={latitude:a.latitude+(b.latitude-a.latitude)*ratio,longitude:a.longitude+(b.longitude-a.longitude)*ratio};
  const measured=course.cumulativeMeters[i-1]+(course.cumulativeMeters[i]-course.cumulativeMeters[i-1])*ratio;
  candidates.push({distanceMeters:measured/course.measuredMeters*course.distanceMeters,gapMeters:distanceBetween(position,point),position});
 }
 candidates.sort((a,b)=>a.gapMeters-b.gapMeters);
 const nearest=candidates[0]?.gapMeters??Infinity;
 if(nearest>150)return [];
 const result:typeof candidates=[];
 for(const c of candidates){if(c.gapMeters>Math.min(150,nearest+30))break;if(result.every(p=>Math.abs(p.distanceMeters-c.distanceMeters)>200))result.push(c);}
 return result.sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,10);
}

export function cheerArrival(state:TrackingState,distanceMeters:number,now:number):{kind:"confirmed"|"estimated-passed"|"upcoming"|"unavailable";at:number|null;seconds:number|null}{
 if(state.lastCheckpoint&&state.lastCheckpoint.distanceMeters>=distanceMeters)return {kind:"confirmed",at:null,seconds:null};
 if(["stale","dnf","dns"].includes(state.status))return {kind:"unavailable",at:null,seconds:null};
 const anchor=state.lastCheckpoint;
 const base=anchor?Date.parse(anchor.passedAt):state.status==="not-started"?Date.parse(state.runner.startAt):now-state.elapsedSeconds*1000;
 const at=base+(distanceMeters-(anchor?.distanceMeters??0))/1000*state.paceSeconds*1000;
 return {kind:at<=now?"estimated-passed":"upcoming",at,seconds:Math.max(0,(at-now)/1000)};
}
export const cheerPosition = positionAtDistance;
