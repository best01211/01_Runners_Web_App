import Link from "next/link";
import { redirect,notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUUID } from "@/lib/race-tracking/validation";
import { TrackingTabs } from "@/components/race-tracking/tracking-tabs";
import { LiveTracking } from "@/components/race-tracking/live-tracking";
export const metadata={title:"라이브 선수 추적 | 01Runners"};
export default async function TrackingRacePage({params}:{params:Promise<{raceId:string}>}){
 const p=await getCurrentProfile();if(!p)redirect("/login");
 if(p.account_status!=="active")redirect("/account-status");
 if(p.approval_status!=="approved"||p.role==="pending")redirect("/pending");
 const{raceId}=await params;if(!isUUID(raceId))notFound();
 const{data:race,error}=await createSupabaseAdminClient().from("tracking_races").select("name,status").eq("race_id",raceId).maybeSingle();
 if(error)return <main className="mx-auto max-w-2xl p-6"><Link href="/tracking">← 추적 목록</Link><p className="mt-6">추적 정보를 불러오지 못했습니다. DB 설정을 확인해주세요.</p></main>;
 if(!race||race.status!=="active")notFound();
 return <main className="mx-auto min-h-screen max-w-6xl px-4 py-8"><Link href="/tracking" className="text-sm font-semibold text-emerald-700">← 추적 목록</Link><TrackingTabs active="live" admin={p.role==="admin"}/><LiveTracking scheduleId={raceId} apiPath={`/api/tracking/${raceId}`} title={race.name}/></main>;
}
