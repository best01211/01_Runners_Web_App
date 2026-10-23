import { loadRegularTemplates } from "@/lib/regular-run-templates-server";
import { redirect } from "next/navigation";
import { getCurrentPageProfile as getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { ScheduleForm } from "@/components/schedules/schedule-form";

export default async function NewSchedulePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["member", "staff", "admin"].includes(profile.role)) redirect("/schedules");
  const canManageTypes = isStaffOrAdmin(profile);
  const { type } = await searchParams;
  const templates = canManageTypes ? await loadRegularTemplates() : [];
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><header className="page-heading"><div><p className="eyebrow">일정 등록</p><h1>일정 만들기</h1><p className="page-description">러닝 시간, 장소와 모집 정보를 입력해주세요.</p></div></header>{!canManageTypes&&<p className="service-notice">일반 회원은 번개런을 만들 수 있습니다.</p>}<div className="form-surface"><ScheduleForm templates={templates} canManageTypes={canManageTypes} initial={canManageTypes && type === "event" ? { schedule_type: "event" } : undefined} /></div></main>;
}
