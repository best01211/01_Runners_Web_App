import {loadTrackingSnapshot} from "@/lib/tracking-snapshot-server";
import {DeleteRaceButton} from "@/components/race-tracking/delete-race-button";
import {canAdminister,canRegisterTrackingEntries} from "@/lib/auth/account-access";
import {canUseService} from "@/lib/auth/account-access";
import Link from "next/link";
import { redirect,notFound } from "next/navigation";
import { getCurrentPageProfile as getCurrentProfile } from "@/lib/auth/current-user";
import { isUUID } from "@/lib/race-tracking/validation";
import { TrackingTabs } from "@/components/race-tracking/tracking-tabs";
import { LiveTracking } from "@/components/race-tracking/live-tracking";
export async function TrackingRaceScreen({params,view}:{params:Promise<{raceId:string}>;view:"overview"|"runner"|"cheer"|"entries"|"admin"}){
 const p=await getCurrentProfile();if(!p)redirect("/login");
 if(!canUseService(p))redirect("/account-status");
 if(p.approval_status!=="approved"||p.role==="pending")redirect("/pending");
 const{raceId}=await params;if(!isUUID(raceId))notFound();
 if(p.service_blocked?.liveTracking)redirect("/maintenance");
 if(view==="entries"&&!canRegisterTrackingEntries(p))redirect("/tracking/"+raceId);
 if(view==="admin"&&!canAdminister(p))redirect("/tracking/"+raceId);
 let snapshot;
 try{snapshot=await loadTrackingSnapshot(raceId,p);}catch(error){if(error instanceof Error&&error.message==="NOT_FOUND")notFound();return <main className="mx-auto max-w-2xl p-6"><Link href="/tracking">← 추적 목록</Link><p className="mt-6">추적 정보를 불러오지 못했습니다. DB 설정을 확인해주세요.</p></main>;}
 const race={name:snapshot.title};
 return <main className="mx-auto min-h-screen max-w-6xl px-4 py-8"><Link href="/tracking" className="text-sm font-semibold text-emerald-700">← 추적 목록</Link><TrackingTabs active="live" admin={canAdminister(p)}/>{view==="admin"&&canAdminister(p)&&(snapshot.eventId!==raceId||p.role==="admin")&&<div className="my-4 flex justify-end"><DeleteRaceButton includesCourses={snapshot.eventId===raceId} raceId={raceId} name={`${race.name} · ${snapshot.course?.name??""}`} redirectAfter/></div>}<LiveTracking key={view} initialView={view} initialData={snapshot} scheduleId={raceId} apiPath={`/api/tracking/${raceId}`} title={race.name}/></main>;
}

