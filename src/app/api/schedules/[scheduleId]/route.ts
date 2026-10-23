import { canUseService } from "@/lib/auth/account-access";
import { publicSchedule } from "@/lib/public-data";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateSchedulePayload } from "@/lib/validation/schedule";
import { canEditScheduleType } from "@/lib/validation/schedule-permissions";

type Context = { params: Promise<{ scheduleId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const profile = await getCurrentProfile();
  if (!profile || !canUseService(profile)) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const { scheduleId } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).is("deleted_at", null).maybeSingle();
  if (error) return fail("DATABASE_ERROR", "일정 조회에 실패했습니다.", 500);
  if (!data) return fail("SCHEDULE_NOT_FOUND", "일정을 찾을 수 없습니다.", 404);
  return ok({ schedule: publicSchedule(data) });
}

export async function PATCH(request: Request, { params }: Context) {if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
  const profile = await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const { scheduleId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: current } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).maybeSingle();
  if (!current) return fail("SCHEDULE_NOT_FOUND", "일정을 찾을 수 없습니다.", 404);

  const canManage = isStaffOrAdmin(profile) || (current.schedule_type === "flash" && current.creator_id === profile.user_id);
  if (!canManage) return fail("FORBIDDEN", "수정 권한이 없습니다.", 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400); }
  const parsed = validateSchedulePayload(body);
  if ("error" in parsed) return fail("VALIDATION_ERROR", parsed.error!, 400);
  if (!canEditScheduleType(profile.role, parsed.value!.schedule_type)) return fail("FORBIDDEN", "일반 회원은 번개런만 수정할 수 있습니다.", 403);

  if (parsed.value!.schedule_type === "regular" && !parsed.value!.regular_template_id && (current.schedule_type !== "regular" || current.regular_template_id)) return fail("TEMPLATE_REQUIRED", "정기런 양식을 선택해주세요.", 400);
  if (parsed.value!.regular_template_id && parsed.value!.regular_template_id !== current.regular_template_id) {
    const { data: template, error: templateError } = await admin.from("regular_run_templates").select("template_id").eq("template_id", parsed.value!.regular_template_id).is("deleted_at", null).maybeSingle();
    if (templateError) return fail("DATABASE_ERROR", "정기런 양식을 확인하지 못했습니다.", 500);
    if (!template) return fail("INVALID_TEMPLATE", "삭제되었거나 존재하지 않는 양식입니다.", 409);
  }
  const { data, error } = await admin.from("schedules").update(parsed.value!).eq("schedule_id", scheduleId).select().single();
  if(error){
    if(error.message.includes('SUPPORT_TYPE_HAS_PARTICIPANTS'))return fail('SUPPORT_TYPE_HAS_PARTICIPANTS','짐보관·포토 신청자가 있는 정기런은 일정 유형을 변경할 수 없습니다.',409);
    if(error.message.includes('EVENT_TYPE_HAS_PARTICIPANTS'))return fail('EVENT_TYPE_HAS_PARTICIPANTS','참가자가 있는 이벤트는 일정 유형이나 대회·행사 분류를 변경할 수 없습니다.',409);
    if(error.message.includes('EVENT_CAPACITY_BELOW_COUNT'))return fail('EVENT_CAPACITY_BELOW_COUNT','정원은 현재 신청 인원보다 적게 설정할 수 없습니다.',409);
    return fail("SCHEDULE_UPDATE_FAILED", "일정 수정에 실패했습니다. 이벤트는 SQL(023) 적용 여부를 확인해주세요.", 500);
  }
  return ok({ schedule: publicSchedule(data) });
}

export async function DELETE(request: Request, { params }: Context) {if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
  const profile = await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const { scheduleId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: current } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).maybeSingle();
  if (!current) return fail("SCHEDULE_NOT_FOUND", "일정을 찾을 수 없습니다.", 404);

  const canManage = isStaffOrAdmin(profile) || (current.schedule_type === "flash" && current.creator_id === profile.user_id);
  if (!canManage) return fail("FORBIDDEN", "취소 권한이 없습니다.", 403);

  let reason = "";
  try { reason = String((await request.json()).reason ?? "").trim(); } catch {}
  const { data, error } = await admin.from("schedules").update({
    status: "cancelled",
    cancelled_by: profile.user_id,
    cancelled_at: new Date().toISOString(),
    cancellation_reason: reason || null,
  }).eq("schedule_id", scheduleId).select().single();

  if (error) return fail("SCHEDULE_CANCEL_FAILED", "일정 취소에 실패했습니다.", 500);
  return ok({ schedule: publicSchedule(data) });
}
