import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateSchedulePayload } from "@/lib/validation/schedule";

type Context = { params: Promise<{ scheduleId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const { scheduleId } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).is("deleted_at", null).maybeSingle();
  if (error) return fail("DATABASE_ERROR", "일정 조회에 실패했습니다.", 500);
  if (!data) return fail("SCHEDULE_NOT_FOUND", "일정을 찾을 수 없습니다.", 404);
  return ok({ schedule: data });
}

export async function PATCH(request: Request, { params }: Context) {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
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

  const { data, error } = await admin.from("schedules").update(parsed.value!).eq("schedule_id", scheduleId).select().single();
  if (error) return fail("SCHEDULE_UPDATE_FAILED", "일정 수정에 실패했습니다.", 500);
  return ok({ schedule: data });
}

export async function DELETE(request: Request, { params }: Context) {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
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
  return ok({ schedule: data });
}
