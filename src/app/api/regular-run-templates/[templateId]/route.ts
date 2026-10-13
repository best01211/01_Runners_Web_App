import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonObject } from "@/lib/request-json";
import { parseRegularTemplate, UUID } from "@/lib/regular-run-templates";
type Context = { params: Promise<{ templateId: string }> };
async function mutate(request: Request, context: Context, remove: boolean) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  const profile = await getCurrentProfile();
  if (!isStaffOrAdmin(profile)) return fail("FORBIDDEN", "관리자 또는 운영진 권한이 필요합니다.", 403);
  const { templateId } = await context.params;
  if (!UUID.test(templateId)) return fail("INVALID_TEMPLATE", "양식을 확인해주세요.", 400);
  const body = remove ? null : await readJsonObject(request);
  const parsed = body && parseRegularTemplate(body);
  const value = remove ? { deleted_at: new Date().toISOString() } : parsed && { ...parsed, ...(body?.removeImage === true ? { image_url: null } : {}) };
  if (!value) return fail("INVALID_TEMPLATE", "양식 정보와 페이스 그룹을 확인해주세요. 그룹은 중복 없이 30초 페이스·5km 거리 단위로 입력해주세요.", 400);
  const { data, error } = await createSupabaseAdminClient().from("regular_run_templates").update({ ...value, updated_by: profile!.user_id, updated_at: new Date().toISOString() }).eq("template_id", templateId).is("deleted_at", null).select().maybeSingle();
  if (error) return fail("SAVE_FAILED", "양식을 변경하지 못했습니다.", 500);
  if (!data) return fail("NOT_FOUND", "이미 삭제되었거나 존재하지 않는 양식입니다.", 404);
  return ok({ template: data });
}
export async function PATCH(request: Request, context: Context) { return mutate(request, context, false); }
export async function DELETE(request: Request, context: Context) { return mutate(request, context, true); }
