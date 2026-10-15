import {ScheduleCard} from "@/components/schedules/schedule-card";
import {Icon} from "@/components/ui/icon";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin, canStartActivity } from "@/lib/auth/current-user";
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
  const canCreate = canStartActivity(profile) && ["member", "staff", "admin"].includes(profile.role);

  return <main>
    <header className="page-heading"><div><p className="eyebrow">2001 RUNNERS</p><h1>러닝 일정</h1><p className="page-description">정기런, 번개런, 이벤트 일정을 확인하세요.</p></div><div className="flex flex-wrap gap-2">{isStaffOrAdmin(profile)&&<Link href="/schedules/templates" className="button-secondary">정기런 양식 관리</Link>}{canCreate&&<Link data-maintenance-blocked={Boolean(profile.service_blocked?.scheduleCreation)} href="/schedules/new" className="button-primary"><Icon name="plus" size={16}/>일정 만들기</Link>}</div></header>
    <div className="schedules-toolbar"><nav aria-label="일정 기간" className="segmented-tabs"><Link href="/schedules" aria-current={!past?"page":undefined}>다가오는 일정</Link><Link href="/schedules?view=past" aria-current={past?"page":undefined}>지난 일정</Link></nav><span className="list-count">총 {data?.length??0}개의 일정</span></div>
    <section className="schedule-list">{data?.length?data.map(schedule=><ScheduleCard key={schedule.schedule_id} schedule={schedule} now={now}/>):<div className="empty-state"><span className="empty-icon"><Icon name="calendar" size={28}/></span><h3>{past?"아직 지난 일정이 없어요":"다음 러닝을 준비하고 있어요"}</h3><p>{past?"크루와 함께 달린 일정이 이곳에 모입니다.":"새로운 일정이 등록되면 이곳에서 확인할 수 있어요."}</p></div>}</section>
  </main>;
}
