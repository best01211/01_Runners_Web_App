import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { RaceRegistrationForm } from "@/components/race-tracking/race-registration-form";
import { TrackingTabs } from "@/components/race-tracking/tracking-tabs";
export const metadata={title:"추적 대회 등록 | 01Runners"};
export default async function NewTrackingRacePage(){
 const p=await getCurrentProfile();if(!p)redirect("/login");
 if(p.account_status!=="active")redirect("/account-status");
 if(p.approval_status!=="approved")redirect("/pending");
 if(p.role!=="admin")redirect("/tracking");
 const {error}=await createSupabaseAdminClient().from("tracking_races").select("race_id").limit(1);
 return <main className="mx-auto min-h-screen max-w-2xl px-4 py-8"><Link href="/dashboard" className="text-sm font-semibold text-emerald-700">← 대시보드</Link><TrackingTabs active="new" admin/><h1 className="mt-6 text-2xl font-black">추적 대회 등록</h1><p className="mt-2 text-sm leading-6 text-zinc-600">관리자가 대회 정보와 GPX를 등록합니다. 등록 후 선수 배번호와 계측 기록을 관리할 수 있습니다.</p>{error&&<p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">추적 전용 DB 설정이 필요합니다. 007_standalone_tracking.sql을 적용한 뒤 이 페이지를 새로고침해주세요.</p>}<RaceRegistrationForm ready={!error}/></main>;
}
