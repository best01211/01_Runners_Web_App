import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CancelScheduleButton } from "@/components/schedules/cancel-schedule-button";
import { ParticipationPanel } from "@/components/participation/participation-panel";

type Props={params:Promise<{scheduleId:string}>};

export default async function ScheduleDetailPage({params}:Props){
  const profile=await getCurrentProfile();
  if(!profile) redirect("/login");
  const {scheduleId}=await params;
  const admin=createSupabaseAdminClient();
  const {data:schedule,error}=await admin.from("schedules").select("*").eq("schedule_id",scheduleId).is("deleted_at",null).maybeSingle();
  if(error) throw new Error("일정을 불러오지 못했습니다.");
  if(!schedule) notFound();

  const canManage=isStaffOrAdmin(profile)||(schedule.schedule_type==="flash"&&schedule.creator_id===profile.user_id);
  const [{data:participation},{count:participantCount}]=await Promise.all([
    admin.from("schedule_participations").select("participation_id,status,participation_locked").eq("schedule_id",scheduleId).eq("user_id",profile.user_id).in("status",["registered","completed"]).maybeSingle(),
    admin.from("schedule_participations").select("*",{count:"exact",head:true}).eq("schedule_id",scheduleId).in("status",["registered","completed"]),
  ]);
  const canParticipate=profile.account_status==="active"&&profile.approval_status==="approved"&&["guest","member","staff"].includes(profile.role);

  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
    <Link href="/schedules" className="text-sm font-semibold text-emerald-700">← 일정 목록</Link>
    <section className="mt-6 rounded-3xl border border-zinc-200 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-600">{schedule.schedule_type} · {schedule.status}</p><h1 className="mt-2 text-3xl font-bold">{schedule.title}</h1></div>
      {canManage&&schedule.status!=="cancelled"&&<div className="flex gap-2"><Link href={`/schedules/${scheduleId}/edit`} className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold">수정</Link><CancelScheduleButton scheduleId={scheduleId}/></div>}</div>
      <dl className="mt-8 grid gap-5 rounded-2xl bg-zinc-50 p-6 sm:grid-cols-2"><div><dt className="text-sm text-zinc-500">일정 시간</dt><dd className="mt-1 font-semibold">{new Date(schedule.start_at).toLocaleString("ko-KR")}</dd></div><div><dt className="text-sm text-zinc-500">장소</dt><dd className="mt-1 font-semibold">{schedule.location}</dd></div><div><dt className="text-sm text-zinc-500">신청 마감</dt><dd className="mt-1 font-semibold">{new Date(schedule.registration_end_at).toLocaleString("ko-KR")}</dd></div><div><dt className="text-sm text-zinc-500">정원</dt><dd className="mt-1 font-semibold">{schedule.capacity?`${schedule.capacity}명`:"제한 없음"}</dd></div></dl>
      <div className="mt-8 whitespace-pre-wrap leading-7 text-zinc-700">{schedule.description||"상세 설명이 없습니다."}</div>
      {schedule.status==="cancelled"?<div className="mt-8 rounded-2xl bg-red-50 p-5 text-red-800">취소된 일정입니다.{schedule.cancellation_reason?` 사유: ${schedule.cancellation_reason}`:""}</div>:<ParticipationPanel scheduleId={scheduleId} scheduleStatus={schedule.status} participantCount={participantCount??0} capacity={schedule.capacity} registrationStartAt={schedule.registration_start_at} registrationEndAt={schedule.registration_end_at} cancellationDeadlineAt={schedule.cancellation_deadline_at} participation={participation} canParticipate={canParticipate}/>} 
    </section>
  </main>;
}
