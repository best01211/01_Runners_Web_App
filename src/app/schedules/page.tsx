import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function SchedulesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("schedules").select("schedule_id,title,schedule_type,status,location,start_at,registration_end_at,capacity").is("deleted_at", null).order("start_at");

  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
    <header className="flex justify-between"><div><p className="font-semibold text-emerald-600">01Runners</p><h1 className="mt-2 text-3xl font-bold">일정</h1></div><Link href="/schedules/new" className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">일정 만들기</Link></header>
    <section className="mt-8 grid gap-4">{data?.length ? data.map((s) => <Link key={s.schedule_id} href={`/schedules/${s.schedule_id}`} className="rounded-2xl border p-6 hover:border-emerald-400"><p className="text-sm text-emerald-700">{s.schedule_type} · {s.status}</p><h2 className="mt-2 text-xl font-bold">{s.title}</h2><p className="mt-2 text-zinc-600">{new Date(s.start_at).toLocaleString("ko-KR")} · {s.location}</p><p className="mt-1 text-sm text-zinc-500">신청 마감 {new Date(s.registration_end_at).toLocaleString("ko-KR")}{s.capacity ? ` · ${s.capacity}명` : ""}</p></Link>) : <div className="rounded-2xl bg-zinc-50 p-12 text-center">등록된 일정이 없습니다.</div>}</section>
  </main>;
}
