import {readAllPages} from "@/lib/query-pagination";
import { canUseService } from "@/lib/auth/account-access";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin, type CurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";


type Context = { params: Promise<{ scheduleId: string }> };

function mapError(message: string): [string,string,number] {
  const m: Record<string,[string,string,number]> = {
    STORAGE_STAFF_ONLY:["STORAGE_STAFF_ONLY","짐보관은 운영진만 신청할 수 있습니다.",403],
    SUPPORT_REGULAR_ONLY:["SUPPORT_REGULAR_ONLY","지원 항목은 정기런에서만 신청할 수 있습니다.",400],
    INVALID_PACE_GROUP:["INVALID_PACE_GROUP","해당 일정의 페이스 그룹을 선택해주세요.",400],
    PACE_GROUP_SCHEDULE_MISMATCH:["PACE_GROUP_SCHEDULE_MISMATCH","DB의 페이스 그룹 연결 검증에서 참가가 거절됐습니다. 운영진에게 확인을 요청해주세요.",409],
    PACE_GROUP_REQUIRED:["PACE_GROUP_REQUIRED","정기런은 페이스 그룹 선택이 필요합니다.",400],
    PACE_CHANGE_LOCKED:["PACE_CHANGE_LOCKED","출석 시작 후에는 그룹을 변경할 수 없습니다.",409],
    UNAUTHENTICATED:["UNAUTHORIZED","로그인이 필요합니다.",401],
    PARTICIPATION_FORBIDDEN:["FORBIDDEN","이 계정은 참가할 수 없습니다.",403],
    SCHEDULE_NOT_FOUND:["SCHEDULE_NOT_FOUND","일정을 찾을 수 없습니다.",404],
    SCHEDULE_NOT_OPEN:["SCHEDULE_NOT_OPEN","현재 참가 신청이 가능한 일정이 아닙니다.",409],
    REGISTRATION_NOT_STARTED:["REGISTRATION_NOT_STARTED","아직 참가 신청 기간이 아닙니다.",409],
    REGISTRATION_CLOSED:["REGISTRATION_CLOSED","참가 신청이 마감되었습니다.",409],
    GUEST_NOT_ALLOWED:["GUEST_NOT_ALLOWED","게스트 참가가 허용되지 않은 일정입니다.",403],
    ALREADY_PARTICIPATING:["ALREADY_PARTICIPATING","이미 참가 중인 일정입니다.",409],
    SCHEDULE_FULL:["SCHEDULE_FULL","일정 정원이 마감되었습니다.",409],
    ACTIVE_PARTICIPATION_NOT_FOUND:["ACTIVE_PARTICIPATION_NOT_FOUND","활성 참가 신청을 찾을 수 없습니다.",404],
    PARTICIPATION_LOCKED:["PARTICIPATION_LOCKED","출석이 시작되어 참가를 취소할 수 없습니다.",409],
    CANCELLATION_DEADLINE_PASSED:["CANCELLATION_DEADLINE_PASSED","참가 취소 가능 시간이 지났습니다.",409],
  };
  const key = Object.keys(m).find(key => message === key || message.startsWith(`${key}:`));
  return key ? m[key] : ["PARTICIPATION_FAILED","참가 처리에 실패했습니다.",500];
}

function participationFailure(error: {code:string;message:string;details?:string;hint?:string}, profile: CurrentProfile, scheduleId: string, action: string) {
  console.error("Participation RPC failed", {scheduleId, action, code:error.code, message:error.message, details:error.details, hint:error.hint});
  const [code,message,status] = mapError(error.message);
  return fail(code,message,status,code === "PARTICIPATION_FAILED" ? {databaseCode:error.code,...(isStaffOrAdmin(profile)?{databaseMessage:error.message}:{})} : undefined);
}

export async function GET(_request: Request,{params}:Context){
  const profile=await getCurrentProfile();
  if (!profile || !canUseService(profile)) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  const supabase=await createSupabaseServerClient();
  try {
  const [ownResult,groups,scheduleResult,paceResult]=await Promise.all([
    supabase.from("schedule_participations").select("participation_id,schedule_id,user_id,status,registered_at,cancelled_at,cancellation_reason,participation_locked,pace_change_locked,pace_group_id").eq("schedule_id",scheduleId).eq("user_id",profile.user_id).in("status",["registered","completed"]).maybeSingle(),
    readAllPages((from,to)=>createSupabaseAdminClient().from("schedule_participations").select("pace_group_id,user_id,profiles:profiles!schedule_participations_user_id_fkey!inner(name,role)").eq("schedule_id",scheduleId).in("status",["registered","completed"]).order("participation_id").range(from,to)),
    createSupabaseAdminClient().from("schedules").select("status,capacity,staff_in_capacity,registration_start_at,registration_end_at,cancellation_deadline_at,attendance_opened_at").eq("schedule_id",scheduleId).is("deleted_at",null).maybeSingle(),
    createSupabaseAdminClient().from("pace_groups").select("pace_group_id,pace_seconds,distance_km,group_kind").eq("schedule_id",scheduleId).order("pace_seconds"),
  ]);
  if(scheduleResult.error||paceResult.error)throw new Error();
  if(!scheduleResult.data)return fail("NOT_FOUND","일정을 찾을 수 없습니다.",404);
  if(ownResult.error)throw new Error();
  const data=ownResult.data;
  const groupCounts:Record<string,number>={};for(const row of groups){const key=row.pace_group_id??'none';groupCounts[key]=(groupCounts[key]??0)+1;}
  const groupMembers:Record<string,{userId:string;name:string}[]>={};
  for(const row of groups){const key=row.pace_group_id??'none';const member=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;(groupMembers[key]??=[]).push({userId:row.user_id,name:member?.name??"회원"});}
  const schedule=scheduleResult.data;
  const participantCount=groups.filter(row=>schedule.staff_in_capacity||(Array.isArray(row.profiles)?row.profiles[0]:row.profiles)?.role!=="staff").length;
  return ok({participation:data,groupCounts,groupMembers,participantCount,totalParticipants:groups.length,schedule,paceGroups:paceResult.data});
  } catch { return fail("DATABASE_ERROR","참가 정보를 불러오지 못했습니다.",500); }
}

export async function POST(request: Request,{params}:Context){if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
  const profile=await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  const supabase=await createSupabaseServerClient();
  let paceGroupId:string|null=null;try{const body=await request.json();paceGroupId=String(body.paceGroupId??"")||null;}catch{return fail("INVALID_JSON","입력값을 확인해주세요.");}
  const {data,error}=await supabase.rpc("register_schedule_participation_with_group",{target_schedule_id:scheduleId,target_pace_group_id:paceGroupId});
  if(error) return participationFailure(error,profile,scheduleId,"register");

  return ok({participation:data},201);
}

export async function DELETE(request: Request,{params}:Context){if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
  const profile=await getCurrentProfile();
  if (!profile || !canUseService(profile)) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  let reason="";
  try{ const body=await request.json(); reason=String(body.reason??"").trim(); }catch{}
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("cancel_schedule_participation",{target_schedule_id:scheduleId,reason_text:reason||null});
  if(error) return participationFailure(error,profile,scheduleId,"cancel");
  return ok({participation:data});
}

export async function PATCH(request: Request,{params}:Context){if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
  const profile=await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  let paceGroupId="";
  try{paceGroupId=String((await request.json()).paceGroupId??"");}catch{return fail("INVALID_JSON","요청 형식이 올바르지 않습니다.");}
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("change_participation_group",{target_schedule_id:scheduleId,target_pace_group_id:paceGroupId});
  if(error) return participationFailure(error,profile,scheduleId,"change-group");
  return ok({participation:data});
}
