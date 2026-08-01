import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateSchedulePayload } from "@/lib/validation/schedule";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("schedules")
    .select("schedule_id,title,description,schedule_type,status,location,start_at,registration_end_at,capacity,creator_id")
    .is("deleted_at", null)
    .order("start_at", { ascending: true });

  if (error) return fail("DATABASE_ERROR", "일정 목록 조회에 실패했습니다.", 500);
  return ok({ schedules: data });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400); }

  const parsed = validateSchedulePayload(body);
  if ("error" in parsed) return fail("VALIDATION_ERROR", parsed.error!, 400);

  const canCreate = isStaffOrAdmin(profile) || (profile.role === "member" && parsed.value!.schedule_type === "flash");
  if (!canCreate) return fail("FORBIDDEN", "일반 회원은 번개런만 생성할 수 있습니다.", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("schedules")
    .insert({ ...parsed.value!, status: "open", creator_id: profile.user_id })
    .select()
    .single();

  if (error) {
    console.error(error);
    return fail("SCHEDULE_CREATE_FAILED", "일정 생성에 실패했습니다.", 500);
  }
  return ok({ schedule: data }, 201);
}
