import { scheduleTypeLabels, scheduleStatusLabels } from "@/lib/schedule-labels";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const admin = createSupabaseAdminClient();
  const { view } = await searchParams;
  const past = view === "past";
  let query = admin.from("schedules").select("schedule_id,title,schedule_type,status,location,start_at,end_at,registration_end_at,capacity").is("deleted_at", null);
  const now = new Date().toISOString();
  query = past ? query.lt("end_at", now) : query.gte("end_at", now);
  const { data, error } = await query.order("start_at", { ascending: !past });
  if (error) throw new Error("일정 목록을 불러오지 못했습니다.");
  const canCreate = ["member", "staff", "admin"].includes(profile.role);

  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-semibold text-emerald-600">01Runners</p><h1 className="mt-2 text-3xl font-bold">일정</h1></div><div className="flex flex-wrap gap-2">{isStaffOrAdmin(profile)&&<Link href="/schedules/templates" className="inline-flex min-h-11 items-center rounded-xl border px-4 py-3 font-bold">정기런 양식 관리</Link>}{canCreate && <Link href="/schedules/new" className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">일정 만들기</Link>}</div></header>
    <nav aria-label="일정 기간" className="mt-6 flex gap-3"><Link href="/schedules" aria-current={!past?"page":undefined} className={`min-h-11 rounded-xl px-4 py-3 font-semibold ${!past?"bg-emerald-600 text-white":"bg-zinc-100 text-zinc-700"}`}>다가오는 일정</Link><Link href="/schedules?view=past" aria-current={past?"page":undefined} className={`min-h-11 rounded-xl px-4 py-3 font-semibold ${past?"bg-emerald-600 text-white":"bg-zinc-100 text-zinc-700"}`}>지난 일정</Link></nav><section className="mt-8 grid gap-4">{data?.length ? data.map((s) => <Link key={s.schedule_id} href={`/schedules/${s.schedule_id}`} className="rounded-2xl border p-6 hover:border-emerald-400"><p className="text-sm text-emerald-700">{scheduleTypeLabels[s.schedule_type]??s.schedule_type} · {s.status==="open"&&new Date(s.registration_end_at).getTime()<new Date(now).getTime()?"모집 마감":scheduleStatusLabels[s.status]??s.status}</p><h2 className="mt-2 text-xl font-bold">{s.title}</h2><p className="mt-2 text-zinc-600">{new Date(s.start_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {s.location}</p><p className="mt-1 text-sm text-zinc-500">신청 마감 {new Date(s.registration_end_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{s.capacity ? ` · ${s.capacity}명` : ""}</p></Link>) : <div className="rounded-2xl bg-zinc-50 p-12 text-center">{past?"지난 일정이 없습니다.":"다가오는 일정이 없습니다."}</div>}</section>
  </main>;
}
