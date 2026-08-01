import { notFound, redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ScheduleForm } from "@/components/schedules/schedule-form";
import { CancelScheduleButton } from "@/components/schedules/cancel-schedule-button";

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
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><h1 className="text-3xl font-bold">일정 수정</h1><div className="mt-8"><ScheduleForm initial={s} /></div></main>;
}
