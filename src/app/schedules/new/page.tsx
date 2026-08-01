import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { ScheduleForm } from "@/components/schedules/schedule-form";

export default async function NewSchedulePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12"><p className="font-semibold text-emerald-600">01Runners</p><h1 className="mt-2 text-3xl font-bold">일정 만들기</h1><p className="mt-3 text-zinc-600">일반 회원은 번개런만 생성할 수 있습니다.</p><div className="mt-8"><ScheduleForm /></div></main>;
}
