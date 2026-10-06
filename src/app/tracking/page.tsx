import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TrackingTabs } from "@/components/race-tracking/tracking-tabs";
export const metadata={title:"선수 추적 | 01Runners"};
export default async function TrackingPage(){
 const p=await getCurrentProfile();if(!p)redirect("/login");
 if(p.account_status!=="active")redirect("/account-status");
 if(p.approval_status!=="approved"||p.role==="pending")redirect("/pending");
 const{data:races,error}=await createSupabaseAdminClient().from("tracking_races").select("race_id,name,start_at,location,distance_meters").eq("status","active").order("start_at",{ascending:false}).limit(100);
 return <main className="mx-auto min-h-screen max-w-4xl px-4 py-8"><Link href="/dashboard" className="text-sm font-semibold text-emerald-700">← 대시보드</Link><TrackingTabs active="live" admin={p.role==="admin"}/><h1 className="mt-6 text-2xl font-black">라이브 선수 추적</h1><p className="mt-2 text-sm text-zinc-600">관리자가 등록한 대회의 계측 기반 예상 위치를 확인합니다.</p><div className="mt-6 space-y-4">{error?<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{p.role==="admin"?"추적 전용 DB 설정이 필요합니다. 007 마이그레이션을 적용해주세요.":"추적 대회를 준비하고 있습니다."}</p>:!races?.length?<div className="rounded-2xl border p-6"><h2 className="font-bold">등록된 추적 대회가 없습니다.</h2><p className="mt-2 text-sm text-zinc-500">{p.role==="admin"?"대회 등록 탭에서 대회 정보와 GPX를 등록해주세요.":"관리자가 대회를 등록하면 이곳에서 확인할 수 있습니다."}</p></div>:races.map(r=><Link key={r.race_id} href={`/tracking/${r.race_id}`} className="block rounded-2xl border p-5"><h2 className="text-lg font-bold">{r.name}</h2><p className="mt-2 text-sm text-zinc-500">{new Date(r.start_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} · {r.distance_meters/1000}km{r.location?` · ${r.location}`:""}</p><p className="mt-3 text-sm font-bold text-emerald-700">라이브 추적 보기 →</p></Link>)}</div></main>;
}
