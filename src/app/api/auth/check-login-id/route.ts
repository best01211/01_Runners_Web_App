import { fail, ok } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const loginId = new URL(request.url).searchParams.get("loginId")?.trim();
  if (!loginId || !/^[A-Za-z0-9_]{4,30}$/.test(loginId)) return fail("INVALID_LOGIN_ID", "올바른 아이디를 입력해 주세요.");
  const { data, error } = await createSupabaseAdminClient().from("profiles").select("user_id").eq("login_id", loginId).maybeSingle();
  if (error) return fail("DATABASE_ERROR", "중복 확인 중 오류가 발생했습니다.", 500);
  return ok({ available: data === null });
}
