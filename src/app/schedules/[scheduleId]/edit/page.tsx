import { loadRegularTemplates } from "@/lib/regular-run-templates-server";
import { notFound, redirect } from "next/navigation";
import { getCurrentPageProfile as getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ScheduleForm } from "@/components/schedules/schedule-form";

type Props = { params: Promise<{ scheduleId: string }> };

export default async function EditSchedulePage({ params }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const { scheduleId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: s } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).maybeSingle();
  if (!s) notFound();
  const canManage = isStaffOrAdmin(profile) || (s.schedule_type === "flash" && s.creator_id === profile.user_id);
  if (!canManage) redirect(`/schedules/${scheduleId}`);
  const templates = isStaffOrAdmin(profile) ? await loadRegularTemplates() : [];
  if (isStaffOrAdmin(profile) && s.regular_template_id && !templates.some(item => item.template_id === s.regular_template_id)) {
    const { data: retired, error: retiredError } = await admin.from("regular_run_templates").select("template_id,name,description,location,capacity,image_url,deleted_at,pace_groups").eq("template_id", s.regular_template_id).maybeSingle();
    if (retiredError) throw new Error("기존 정기런 양식을 불러오지 못했습니다.");
    if (retired) templates.push(retired);
  }
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><h1 className="text-3xl font-bold">일정 수정</h1><div className="mt-8"><ScheduleForm templates={templates} initial={s} canManageTypes={isStaffOrAdmin(profile)} /></div></main>;
}
