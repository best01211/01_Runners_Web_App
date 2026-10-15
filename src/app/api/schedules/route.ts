import { canUseService } from "@/lib/auth/account-access";
import { parsePaceGroups } from "@/lib/regular-run-templates";
import { publicSchedule } from "@/lib/public-data";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateSchedulePayload } from "@/lib/validation/schedule";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !canUseService(profile)) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("schedules")
    .select("schedule_id,title,description,schedule_type,status,location,start_at,registration_end_at,capacity,creator_id")
    .is("deleted_at", null)
    .order("start_at", { ascending: true });

  if (error) return fail("DATABASE_ERROR", "일정 목록 조회에 실패했습니다.", 500);
  return ok({ schedules: data });
}

export async function POST(request: Request) {if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
  const profile = await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400); }

  const parsed = validateSchedulePayload(body);
  if ("error" in parsed) return fail("VALIDATION_ERROR", parsed.error!, 400);

  const groupPayload = body.paceGroups === undefined ? null : parsePaceGroups(body.paceGroups);
  if (body.paceGroups !== undefined && !groupPayload) return fail("INVALID_PACE_GROUPS", "페이스 그룹은 중복 없이 30초·5km 단위로 입력해주세요.", 400);
  if (parsed.value!.schedule_type === "regular" && groupPayload && !groupPayload.length) return fail("PACE_GROUP_REQUIRED", "정기런에는 페이스 그룹을 한 개 이상 추가해주세요.", 400);
  if(parsed.value!.schedule_type==="event"&&groupPayload?.length)return fail("INVALID_PACE_GROUPS","이벤트에는 페이스 그룹을 등록하지 않습니다.",400);
  const canCreate = isStaffOrAdmin(profile) || (profile.role === "member" && parsed.value!.schedule_type === "flash");
  if (!canCreate) return fail("FORBIDDEN", "일반 회원은 번개런만 생성할 수 있습니다.", 403);

  const admin = createSupabaseAdminClient();
  if (parsed.value!.schedule_type === "regular") {
    const id = parsed.value!.regular_template_id;
    if (!id) return fail("TEMPLATE_REQUIRED", "정기런 양식을 선택해주세요.", 400);
    const { data: template, error: templateError } = await admin.from("regular_run_templates").select("template_id").eq("template_id", id).is("deleted_at", null).maybeSingle();
    if (templateError) return fail("DATABASE_ERROR", "정기런 양식을 확인하지 못했습니다. 010 SQL 적용 상태를 확인해주세요.", 500);
    if (!template) return fail("INVALID_TEMPLATE", "삭제되었거나 존재하지 않는 양식입니다.", 409);
  }
  const { data, error } = await admin
    .from("schedules")
    .insert({ ...parsed.value!, ...(groupPayload ? {creation_pace_groups:groupPayload} : {}), status: "open", creator_id: profile.user_id })
    .select()
    .single();

  if (error) {
    console.error(error);
    return fail("SCHEDULE_CREATE_FAILED", parsed.value!.schedule_type==="event"?"이벤트 생성에 실패했습니다. SQL(023) 적용 여부를 확인해주세요.":"일정 생성에 실패했습니다. 페이스 그룹을 입력했다면 015 SQL 적용 상태를 확인해주세요.", 500);
  }
  // Creator participation is inserted atomically by migration 009.
  return ok({ schedule: publicSchedule(data) }, 201);
}
