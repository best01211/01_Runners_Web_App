import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseScorePolicy } from "@/lib/ranking";
export async function GET() {
 const p = await getCurrentProfile();
 if (p?.role !== "admin" || !isStaffOrAdmin(p)) return fail("FORBIDDEN", "관리자 권한이 필요합니다.", 403);
 const { data, error } = await createSupabaseAdminClient().from("system_settings").select("*");
 return error ? fail("DATABASE_ERROR", "설정을 불러오지 못했습니다.", 500) : ok({ settings: data });
}
export async function PUT(request: Request) {
 const p = await getCurrentProfile();
 if (p?.role !== "admin" || !isStaffOrAdmin(p)) return fail("FORBIDDEN", "관리자 권한이 필요합니다.", 403);
 let body;
 try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
 if (!body || !["maintenance", "score_policy"].includes(body.key)) return fail("INVALID_KEY", "설정 항목이 올바르지 않습니다.");
 let value = body.value;
 if (body.key === "score_policy") {
  value = parseScorePolicy(value);
  if (!value) return fail("INVALID_POLICY", "점수와 최소 활동은 0~100000 정수여야 합니다.");
 } else if (!value || !["normal", "maintenance", "restricted"].includes(value.status)) return fail("INVALID_STATUS", "서비스 상태를 확인해주세요.");
 const { data, error } = await createSupabaseAdminClient().from("system_settings").upsert({ setting_key: body.key, setting_value: value, updated_by: p.user_id }).select().single();
 return error ? fail("UPDATE_FAILED", "설정 변경에 실패했습니다.", 500) : ok({ setting: data });
}
