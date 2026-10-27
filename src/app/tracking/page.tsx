import {DeleteRaceButton} from "@/components/race-tracking/delete-race-button";
import {Icon} from "@/components/ui/icon";
import {canAdminister} from "@/lib/auth/account-access";
import {canUseService} from "@/lib/auth/account-access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPageProfile as getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TrackingTabs } from "@/components/race-tracking/tracking-tabs";
export const metadata={title:"선수 추적 | 01Runners"};
export default async function TrackingPage(){
 const p=await getCurrentProfile();if(!p)redirect("/login");
 if(!canUseService(p))redirect("/account-status");
 if(p.approval_status!=="approved"||p.role==="pending")redirect("/pending");
 const{data:races,error}=await createSupabaseAdminClient().from("tracking_races").select("race_id,name,start_at,location,distance_meters").eq("status","active").is("parent_race_id",null).order("start_at",{ascending:false}).limit(100);
 return <main className="mx-auto min-h-screen max-w-4xl px-4 py-8"><header className="page-heading"><div><p className="eyebrow">대회 현황</p><h1>라이브 추적</h1><p className="page-description">대회에 참가한 크루의 계측 기록과 예상 위치를 확인하세요.</p></div><span className="member-pill"><span className="status-dot"/>실시간 추적</span></header><TrackingTabs active="live" admin={canAdminister(p)}/><div className="mt-6 space-y-4">{error?<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{canAdminister(p)?"추적 전용 DB 설정이 필요합니다. 028 마이그레이션을 적용해주세요.":"추적 대회를 준비하고 있습니다."}</p>:!races?.length?<div className="rounded-2xl border p-6"><h2 className="font-bold">등록된 추적 대회가 없습니다.</h2><p className="mt-2 text-sm text-zinc-500">{canAdminister(p)?"대회 등록 탭에서 대회 정보와 GPX를 등록해주세요.":"관리자가 대회를 등록하면 이곳에서 확인할 수 있습니다."}</p></div>:races.map(r=><article key={r.race_id} className="tracking-race-card rounded-2xl border"><Link href={`/tracking/${r.race_id}`} className="block"><h2 className="text-lg font-bold">{r.name}</h2><p className="mt-2 text-sm text-zinc-500">{new Date(r.start_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}{r.location?` · ${r.location}`:""}</p><p className="text-link mt-3">라이브 추적 보기<Icon name="arrow" size={16}/></p></Link>{canAdminister(p)&&p.role==="admin"&&<div className="mt-4 border-t border-zinc-100 pt-4"><DeleteRaceButton includesCourses raceId={r.race_id} name={r.name}/></div>}</article>)}</div></main>;
}

