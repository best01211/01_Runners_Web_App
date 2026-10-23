import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {getCurrentPageProfile as getCurrentProfile} from "@/lib/auth/current-user";
import {parseMaintenanceSetting,canAccessDuringService,SERVICE_FEATURES} from "@/lib/service-policy";
export const dynamic = "force-dynamic";
export default async function MaintenancePage(){
 const {data}=await createSupabaseAdminClient().from("system_settings").select("setting_value").eq("setting_key","maintenance").maybeSingle();
 const setting=parseMaintenanceSetting(data?.setting_value??{status:"normal"});const profile=await getCurrentProfile();
 const partial=setting?.status==="restricted";const access=setting&&profile&&canAccessDuringService(setting,profile);
 return <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white"><section className="max-w-xl text-center"><p className="font-bold text-amber-400">{partial?"일부 기능 제한":"서비스 점검"}</p><h1 className="mt-4 text-4xl font-black">{partial&&access?"일부 기능의 이용이 제한됩니다":"서비스 이용이 잠시 제한됩니다"}</h1><p className="mt-5 text-lg text-zinc-300">{setting?.message||"안정적인 서비스 제공을 위해 점검 중입니다."}</p>{partial&&access&&<ul className="mt-4 space-y-2 text-sm text-zinc-300">{Object.entries(setting!.blocked).filter(([key,value])=>value&&key!=="access").map(([key])=><li key={key}>{SERVICE_FEATURES[key as keyof typeof SERVICE_FEATURES]}</li>)}</ul>}{setting?.endsAt&&<p className="mt-4 text-sm text-zinc-500">종료 안내: {new Date(setting.endsAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} (관리자 수동 해제)</p>}{access&&<Link href="/dashboard" className="mt-6 inline-block rounded-xl border border-white/30 px-5 py-3">대시보드</Link>}<form action="/api/auth/logout" method="post" className="mt-8"><button className="rounded-xl border border-white/30 px-5 py-2">로그아웃</button></form></section></main>;
}
