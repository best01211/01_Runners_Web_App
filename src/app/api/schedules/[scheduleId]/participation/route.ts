import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ scheduleId: string }> };

function mapError(message: string) {
  const m: Record<string,[string,string,number]> = {
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
  return m[message] ?? ["PARTICIPATION_FAILED","참가 처리에 실패했습니다.",500];
}

export async function GET(_request: Request,{params}:Context){
  const profile=await getCurrentProfile();
  if(!profile) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.from("schedule_participations")
    .select("participation_id,schedule_id,user_id,status,registered_at,cancelled_at,cancellation_reason,participation_locked,pace_change_locked")
    .eq("schedule_id",scheduleId).eq("user_id",profile.user_id)
    .in("status",["registered","completed"]).maybeSingle();
  if(error) return fail("DATABASE_ERROR","내 참가 정보를 불러오지 못했습니다.",500);
  return ok({participation:data});
}

export async function POST(_request: Request,{params}:Context){
  const profile=await getCurrentProfile();
  if(!profile) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("register_schedule_participation",{target_schedule_id:scheduleId});
  if(error){ const [c,m,s]=mapError(error.message); return fail(c,m,s); }
  return ok({participation:data},201);
}

export async function DELETE(request: Request,{params}:Context){
  const profile=await getCurrentProfile();
  if(!profile) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
  const {scheduleId}=await params;
  let reason="";
  try{ const body=await request.json(); reason=String(body.reason??"").trim(); }catch{}
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("cancel_schedule_participation",{target_schedule_id:scheduleId,reason_text:reason||null});
  if(error){ const [c,m,s]=mapError(error.message); return fail(c,m,s); }
  return ok({participation:data});
}
