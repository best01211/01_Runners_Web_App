import {DeleteCancelledSchedule} from "@/components/schedules/delete-cancelled-schedule";
import {AdminTestParticipationPanel} from "@/components/participation/admin-test-participation";
import {readAllPages} from "@/lib/query-pagination";
import {loadScheduleComments} from "@/lib/schedule-comments-server";
import Image from "next/image";
import { scheduleTypeLabels, scheduleStatusLabels } from "@/lib/schedule-labels";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPageProfile as getCurrentProfile, isStaffOrAdmin, canStartActivity } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CancelScheduleButton } from "@/components/schedules/cancel-schedule-button";
import {EventParticipationPanel} from "@/components/participation/event-participation-panel";
import { ParticipationPanel } from "@/components/participation/participation-panel";
import { AttendancePanel } from "@/components/attendance/attendance-panel";
import { CommentPanel } from "@/components/comments/comment-panel";

type Props={params:Promise<{scheduleId:string}>};

export default async function ScheduleDetailPage({params}:Props){
  const profile=await getCurrentProfile();
  if(!profile) redirect("/login");
  const {scheduleId}=await params;
  const admin=createSupabaseAdminClient();
  const {data:schedule,error}=await admin.from("schedules").select("*").eq("schedule_id",scheduleId).is("deleted_at",null).maybeSingle();
  if(error) throw new Error("일정을 불러오지 못했습니다.");
  if(!schedule) notFound();

  const canManage=isStaffOrAdmin(profile)||(canStartActivity(profile)&&schedule.schedule_type==="flash"&&schedule.creator_id===profile.user_id);
  // Overdue regular attendance must go through the existing close-and-read API.
  const needsClose=schedule.schedule_type==="regular"&&schedule.attendance_opened_at&&!schedule.attendance_closed_at&&Date.parse(schedule.end_at)<=new Date().getTime();
  let attendanceQuery=admin.from("attendances").select("user_id,status").eq("schedule_id",scheduleId);
  if(!canManage)attendanceQuery=attendanceQuery.eq("user_id",profile.user_id);
  const [templateResult,participantsResult,groupsResult,initialComments,attendanceRows,adminTestResult]=await Promise.all([
    schedule.schedule_type === "regular" && schedule.regular_template_id
      ? admin.from("regular_run_templates").select("image_url").eq("template_id",schedule.regular_template_id).maybeSingle()
      : Promise.resolve({data:null,error:null}),
    readAllPages((from,to)=>admin.from("schedule_participations").select("participation_id,user_id,status,participation_locked,pace_change_locked,pace_group_id,profiles:profiles!schedule_participations_user_id_fkey!inner(role,name)").eq("schedule_id",scheduleId).in("status",["registered","completed"]).order("participation_id").range(from,to)),
    admin.from("pace_groups").select("pace_group_id,pace_seconds,distance_km,group_kind").eq("schedule_id",scheduleId).order("pace_seconds"),
    schedule.comment_enabled ? loadScheduleComments(scheduleId).catch(()=>undefined) : Promise.resolve(undefined),
    needsClose ? Promise.resolve(undefined) : readAllPages((from,to)=>attendanceQuery.order("attendance_id").range(from,to)).catch(()=>undefined),
    profile.role==="admin"?admin.from("admin_schedule_tests").select("pace_group_id,event_role,attendance_status").eq("schedule_id",scheduleId).eq("user_id",profile.user_id).maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  if(templateResult.error||groupsResult.error||adminTestResult.error)throw new Error("일정 참가 정보를 불러오지 못했습니다.");
  const imageUrl=templateResult.data?.image_url??null;
  const participants=participantsResult;
  const participation=participants.find(row=>row.user_id===profile.user_id)??null;
  const participantCount=participants.filter(row=>schedule.staff_in_capacity||(Array.isArray(row.profiles)?row.profiles[0]:row.profiles)?.role!=="staff").length;
  const groupCounts:Record<string,number>={};
  for(const row of participants){const key=row.pace_group_id??"none";groupCounts[key]=(groupCounts[key]??0)+1;}
  const paceGroups=(groupsResult.data??[]).filter(group=>schedule.schedule_type==="regular"||group.group_kind==="running");
  const attendanceByUser=new Map(attendanceRows?.map(row=>[row.user_id,row.status]));
  const initialAttendance=attendanceRows?{
    attendance:canManage?participants.filter(row=>profile.role==="admin"||(Array.isArray(row.profiles)?row.profiles[0]:row.profiles)?.role!=="admin").map(row=>({user_id:row.user_id,pace_group_id:row.pace_group_id,profiles:{name:(Array.isArray(row.profiles)?row.profiles[0]:row.profiles)?.name??"회원"},status:attendanceByUser.get(row.user_id)??"not_checked"})):attendanceRows,
    attendanceOpen:Boolean(schedule.attendance_opened_at&&!schedule.attendance_closed_at),
    attendanceClosed:Boolean(schedule.attendance_closed_at),
    attendanceCode:canManage?schedule.attendance_code??undefined:undefined,
  }:undefined;
  const canParticipate=canStartActivity(profile)&&["guest","member","staff"].includes(profile.role);

  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 [overflow-wrap:anywhere]">
    <section className="schedule-detail mt-6 rounded-3xl border border-zinc-200 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="detail-eyebrow text-sm font-semibold text-emerald-600">{schedule.schedule_type==="event"?(schedule.event_kind==="race"?"대회 이벤트":"행사 이벤트"):(scheduleTypeLabels[schedule.schedule_type]??schedule.schedule_type)} · {scheduleStatusLabels[schedule.status]??schedule.status}</p><h1 className="mt-2 text-3xl font-bold">{schedule.title}</h1></div>
      {canManage&&schedule.status!=="cancelled"&&<div className="flex gap-2"><Link href={`/schedules/${scheduleId}/edit`} className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold">수정</Link><CancelScheduleButton scheduleId={scheduleId}/></div>}</div>
      <dl className="mt-8 grid gap-5 rounded-2xl bg-zinc-50 p-6 sm:grid-cols-2"><div><dt className="text-sm text-zinc-500">일정 시간</dt><dd className="mt-1 font-semibold">{new Date(schedule.start_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</dd></div><div><dt className="text-sm text-zinc-500">장소</dt><dd className="mt-1 font-semibold">{schedule.location}</dd></div><div><dt className="text-sm text-zinc-500">신청 마감</dt><dd className="mt-1 font-semibold">{new Date(schedule.registration_end_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</dd></div><div><dt className="text-sm text-zinc-500">정원</dt><dd className="mt-1 font-semibold">{schedule.capacity?`${schedule.capacity}명`:"제한 없음"}</dd></div></dl>
      {imageUrl && <Image unoptimized src={imageUrl} alt="정기런 안내 사진" width={1200} height={675} className="mt-8 max-h-[32rem] w-full rounded-2xl object-contain" />}
      <div className="mt-8 whitespace-pre-wrap leading-7 text-zinc-700">{schedule.description||"상세 설명이 없습니다."}</div>
      {schedule.status==="cancelled"?<div className="mt-8 rounded-2xl bg-red-50 p-5 text-red-800">취소된 일정입니다.{schedule.cancellation_reason?` 사유: ${schedule.cancellation_reason}`:""}</div>:profile.role==="admin"?<AdminTestParticipationPanel scheduleId={scheduleId} scheduleType={schedule.schedule_type} eventKind={schedule.event_kind} groups={paceGroups} initial={adminTestResult.data} blocked={Boolean(profile.service_blocked?.participation)}/>:schedule.schedule_type==="event"?<EventParticipationPanel scheduleId={scheduleId} canParticipate={canParticipate&&(profile.role!=="guest"||schedule.guest_allowed)} canManage={isStaffOrAdmin(profile)} maintenanceBlocked={Boolean(profile.service_blocked?.participation)}/>:<ParticipationPanel key={`${participation?.participation_id??"none"}:${participation?.pace_group_id??"none"}:${participation?.status??"none"}`} initialGroupCounts={groupCounts} isStaff={isStaffOrAdmin(profile)} maintenanceBlocked={Boolean(profile.service_blocked?.participation)} canChangeGroup={canStartActivity(profile)} scheduleId={scheduleId} scheduleType={schedule.schedule_type} scheduleStatus={schedule.status} participantCount={participantCount??0} capacity={schedule.capacity} capacityExempt={profile.role==="staff"&&!schedule.staff_in_capacity} registrationStartAt={schedule.registration_start_at} registrationEndAt={schedule.registration_end_at} cancellationDeadlineAt={schedule.cancellation_deadline_at} participation={participation} canParticipate={canParticipate} paceGroups={paceGroups??[]} canCreatePaceGroup={isStaffOrAdmin(profile)||(canStartActivity(profile)&&schedule.schedule_type==="flash"&&(canManage||Boolean(participation)))}/>}
      
      {schedule.status==="cancelled"&&profile.role==="admin"&&<DeleteCancelledSchedule scheduleId={scheduleId}/>}
      <AttendancePanel initialData={initialAttendance} scheduleId={scheduleId} canManage={canManage} eventMode={schedule.schedule_type==="event"} paceGroups={schedule.schedule_type==="event"?[]:paceGroups??[]}/>
      {schedule.comment_enabled&&<CommentPanel initialComments={initialComments} scheduleId={scheduleId} currentUserId={profile.user_id} maintenanceBlocked={Boolean(profile.service_blocked?.comments)} canWrite={canStartActivity(profile)} canNotice={isStaffOrAdmin(profile)}/>}
    </section>
  </main>;
}
