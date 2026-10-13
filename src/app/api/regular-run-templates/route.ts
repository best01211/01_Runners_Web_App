import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonObject } from "@/lib/request-json";
import { parseRegularTemplate } from "@/lib/regular-run-templates";
import { loadRegularTemplates } from "@/lib/regular-run-templates-server";
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  try { return ok({ templates: await loadRegularTemplates() }); }
  catch { return fail("DATABASE_ERROR", "정기런 양식을 불러오지 못했습니다. 010 SQL 적용 상태를 확인해주세요.", 500); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  const profile = await getCurrentProfile();
  if (!isStaffOrAdmin(profile)) return fail("FORBIDDEN", "관리자 또는 운영진 권한이 필요합니다.", 403);
  const body = await readJsonObject(request), value = body && parseRegularTemplate(body);
  if (!value) return fail("INVALID_TEMPLATE", "양식 정보와 페이스 그룹을 확인해주세요. 그룹은 중복 없이 30초 페이스·5km 거리 단위로 입력해주세요.", 400);
  const { data, error } = await createSupabaseAdminClient().from("regular_run_templates").insert({ ...value, created_by: profile!.user_id, updated_by: profile!.user_id }).select().single();
  return error ? fail("SAVE_FAILED", "양식 저장에 실패했습니다. 010 SQL 적용 상태를 확인해주세요.", 500) : ok({ template: data }, 201);
}
