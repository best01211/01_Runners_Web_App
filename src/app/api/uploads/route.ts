import { canUseService } from "@/lib/auth/account-access";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validWebp } from "@/lib/images/policy";
import { UUID } from "@/lib/regular-run-templates";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  const profile = await getCurrentProfile();
  if (!profile || !canUseService(profile)) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  if (Number(request.headers.get("content-length")) > 600 * 1024) return fail("INVALID_IMAGE", "사진 용량이 너무 큽니다.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("INVALID_FORM", "사진을 다시 선택해주세요.", 400); }
  const purpose = form.get("purpose");
  if (purpose !== "profile" && purpose !== "regular") return fail("INVALID_PURPOSE", "업로드 용도를 확인해주세요.", 400);
  if (purpose === "regular" && !isStaffOrAdmin(profile)) return fail("FORBIDDEN", "정기런 양식 사진은 관리자와 운영진만 등록할 수 있습니다.", 403);
  if(purpose === "profile" && profile.service_blocked?.profile)return fail("SERVICE_FEATURE_BLOCKED","관리자 설정으로 내 정보 수정이 제한되어 있습니다.",403);
  const admin = createSupabaseAdminClient();
  const templateId = String(form.get("templateId") ?? "");
  if (purpose === "regular") {
    if (!UUID.test(templateId)) return fail("INVALID_TEMPLATE", "정기런 양식을 선택해주세요.", 400);
    const { data: template, error: lookupError } = await admin.from("regular_run_templates").select("template_id").eq("template_id", templateId).is("deleted_at", null).maybeSingle();
    if (lookupError) return fail("DATABASE_ERROR", "양식을 확인하지 못했습니다.", 500);
    if (!template) return fail("NOT_FOUND", "삭제되었거나 존재하지 않는 양식입니다.", 404);
  }
  const file = form.get("file"), limit = (purpose === "profile" ? 200 : 500) * 1024;
  if (!(file instanceof File) || !file.size || file.size > limit || file.type !== "image/webp") return fail("INVALID_IMAGE", "사진을 다시 선택해 압축 후 업로드해주세요.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validWebp(bytes, limit)) return fail("INVALID_IMAGE", "올바른 WebP 사진이 아닙니다.", 400);
  const path = purpose === "profile" ? `${profile.user_id}/profile.webp` : `regular/${templateId}.webp`;
  const { error } = await admin.storage.from("01runners-images").upload(path, bytes, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
  if (error) return fail("UPLOAD_FAILED", "사진 저장에 실패했습니다. 잠시 후 다시 시도해주세요.", 500);
  const { data } = admin.storage.from("01runners-images").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;
  if (purpose === "regular") {
    const { data: saved, error: settingError } = await admin.from("regular_run_templates").update({ image_url: url, updated_by: profile.user_id, updated_at: new Date().toISOString() }).eq("template_id", templateId).is("deleted_at", null).select("template_id").maybeSingle();
    if (settingError || !saved) return fail("SETTING_FAILED", "사진은 업로드됐지만 양식에 연결하지 못했습니다. 양식 상태를 확인해주세요.", 409);
  }
  return ok({ url });
}
