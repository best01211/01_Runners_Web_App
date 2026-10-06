import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrackingDemo } from "@/components/race-tracking/tracking-demo";

export const metadata = { title: "대회 추적 데모 | 01Runners" };
export default async function EventTrackingDemoPage({ params }: { params: Promise<{ scheduleId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.account_status !== "active") redirect("/account-status");
  if (profile.approval_status !== "approved" || profile.role === "pending") redirect("/pending");
  const { scheduleId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scheduleId)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: schedule, error } = await supabase.from("schedules").select("schedule_id,title,schedule_type,status")
    .eq("schedule_id", scheduleId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("대회 정보를 불러오지 못했습니다.");
  if (!schedule || schedule.schedule_type !== "event" || schedule.status === "cancelled") notFound();
  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6">
    <Link href={`/schedules/${scheduleId}`} className="text-sm font-semibold text-emerald-700">← 대회 상세</Link>
    <TrackingDemo eventTitle={schedule.title} />
  </main>;
}
