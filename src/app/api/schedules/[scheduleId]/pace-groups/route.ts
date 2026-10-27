import {createSupabaseServerClient} from "@/lib/supabase/server";
import {isUUID} from "@/lib/race-tracking/validation";
import { canUseService } from "@/lib/auth/account-access";
import { readJsonObject } from "@/lib/request-json";
import{fail,ok}from"@/lib/api-response";import{getCurrentProfile,isStaffOrAdmin}from"@/lib/auth/current-user";import{createSupabaseAdminClient}from"@/lib/supabase/admin";type C={params:Promise<{scheduleId:string}>};export async function GET(_:Request,{params}:C){const p=await getCurrentProfile();if (!p || !canUseService(p))return fail("UNAUTHORIZED","로그인이 필요합니다.",401);const{scheduleId}=await params;const{data,error}=await createSupabaseAdminClient().from("pace_groups").select("*").eq("schedule_id",scheduleId).order("pace_seconds");return error?fail("DATABASE_ERROR","페이스 그룹을 불러오지 못했습니다.",500):ok({groups:data})}export async function POST(r:Request,{params}:C){if (r.headers.get("origin") !== new URL(r.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);const p=await getCurrentProfile();if (!p || p.account_status !== "active" || p.approval_status !== "approved")return fail("UNAUTHORIZED","로그인이 필요합니다.",401);const b=await readJsonObject(r);if(!b)return fail("INVALID_JSON","입력값을 확인해주세요.");const{scheduleId}=await params,a=createSupabaseAdminClient();const{data:s}=await a.from("schedules").select("schedule_type,creator_id,status,deleted_at,attendance_opened_at").eq("schedule_id",scheduleId).maybeSingle();if(!s||s.deleted_at)return fail("NOT_FOUND","일정을 찾을 수 없습니다.",404);if(s.schedule_type==="event")return fail("EVENT_NO_PACE_GROUP","이벤트는 페이스 그룹을 사용하지 않습니다.",400);if(s.status!=="open"||s.attendance_opened_at)return fail("SCHEDULE_LOCKED","현재 페이스 그룹을 생성할 수 없습니다.",409);const participant=await a.from("schedule_participations").select("participation_id").eq("schedule_id",scheduleId).eq("user_id",p.user_id).eq("status","registered").maybeSingle();const can=isStaffOrAdmin(p)||(s.schedule_type==="flash"&&(s.creator_id===p.user_id||Boolean(participant.data)));if(!can)return fail("FORBIDDEN","페이스 그룹 생성 권한이 없습니다.",403);const pace=Number(b.paceSeconds),distance=Number(b.distanceKm);if(!Number.isInteger(pace)||pace<=0||pace%30!==0)return fail("INVALID_PACE","페이스는 30초 단위여야 합니다.");if(!Number.isInteger(distance)||distance<5)return fail("INVALID_DISTANCE","거리는 5km 이상, 1km 단위여야 합니다.");const{data,error}=await a.from("pace_groups").insert({schedule_id:scheduleId,pace_seconds:pace,distance_km:distance,created_by:p.user_id}).select().single();return error?fail("CREATE_FAILED","중복되지 않은 페이스와 거리를 입력해주세요.",409):ok({group:data},201)}

async function manage(request:Request,{params}:C,remove=false) {
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
 const profile=await getCurrentProfile();
 if(!profile||!canUseService(profile))return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
 if(!isStaffOrAdmin(profile))return fail("FORBIDDEN","운영진만 그룹을 관리할 수 있습니다.",403);
 if(profile.service_blocked?.participation)return fail("FORBIDDEN","현재 그룹 관리를 사용할 수 없습니다.",403);
 const {scheduleId}=await params,body=await readJsonObject(request);
 if(!isUUID(scheduleId)||!body||!isUUID(String(body.groupId??"")))return fail("INVALID_INPUT","일정과 그룹을 확인해주세요.");
 const action=remove?"delete":body.action;
 if(!["edit","delete","move"].includes(String(action))||(!remove&&action==="delete"))return fail("INVALID_ACTION","올바르지 않은 요청입니다.");
 if(action==="move"&&!isUUID(String(body.userId??"")))return fail("INVALID_INPUT","이동할 참가자를 확인해주세요.");
 if(action==="edit"&&(typeof body.paceSeconds!=="number"||!Number.isSafeInteger(body.paceSeconds)||body.paceSeconds<=0||body.paceSeconds%30!==0||typeof body.distanceKm!=="number"||!Number.isSafeInteger(body.distanceKm)||body.distanceKm<5))return fail("INVALID_INPUT","페이스는 30초 단위, 거리는 5km 이상 정수로 입력해주세요.");
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc("manage_schedule_pace_group",{target_schedule:scheduleId,payload:{...body,action}});
 if(error){
  if(["42883","PGRST202"].includes(error.code))return fail("SETUP_REQUIRED","그룹 관리 DB 설정이 필요합니다. 040 마이그레이션을 적용해주세요.",503);
  const messages:Record<string,string>={FORBIDDEN:"운영진만 그룹을 관리할 수 있습니다.",SERVICE_FEATURE_BLOCKED:"현재 그룹 관리를 사용할 수 없습니다.",SCHEDULE_NOT_FOUND:"일정을 찾을 수 없습니다.",PACE_CHANGE_LOCKED:"출석이 시작되었거나 모집 중인 일정이 아니어서 변경할 수 없습니다.",INVALID_PACE_GROUP:"해당 일정의 그룹을 선택해주세요.",ACTIVE_PARTICIPATION_NOT_FOUND:"참가 신청자를 찾을 수 없습니다.",SUPPORT_GROUP_FIXED:"짐보관·포토 그룹은 수정·삭제할 수 없습니다.",GROUP_HAS_HISTORY:"신청 이력이 있는 그룹은 삭제할 수 없습니다.",STORAGE_STAFF_ONLY:"짐보관은 운영진만 배정할 수 있습니다.",INVALID_GROUP_VALUES:"페이스와 거리를 확인해주세요.",EVENT_NO_PACE_GROUP:"이벤트는 페이스 그룹을 사용하지 않습니다."};
  const key=Object.keys(messages).find(k=>error.message===k||error.message.startsWith(k+":"));
  return fail(key??"GROUP_MANAGEMENT_FAILED",key?messages[key]:error.code==="23505"?"같은 페이스와 거리의 그룹이 이미 있습니다.":error.code==="23503"?"참조 중인 기록이 있어 그룹을 삭제할 수 없습니다.":"그룹을 변경하지 못했습니다.",key==="FORBIDDEN"?403:409);
 }
 return ok({result:data});
}
export async function PATCH(request:Request,context:C){return manage(request,context);}
export async function DELETE(request:Request,context:C){return manage(request,context,true);}
