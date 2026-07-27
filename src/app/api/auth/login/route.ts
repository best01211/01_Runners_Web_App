import { fail, ok } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다."); }
  const loginId = String(body.loginId ?? "").trim();
  const password = String(body.password ?? "");
  if (!loginId || !password) return fail("VALIDATION_ERROR", "아이디와 비밀번호를 입력해 주세요.");
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("user_id,email,role,account_status,approval_status").eq("login_id", loginId).maybeSingle();
  if (error) return fail("DATABASE_ERROR", "로그인 처리 중 오류가 발생했습니다.", 500);
  if (!profile) return fail("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  if (profile.account_status !== "active") return fail("ACCOUNT_UNAVAILABLE", "현재 이용할 수 없는 계정입니다.", 403);
  const supabase = await createSupabaseServerClient();
  const signed = await supabase.auth.signInWithPassword({ email: profile.email, password });
  if (signed.error || !signed.data.user) return fail("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("user_id", profile.user_id);
  return ok({ user: { userId: profile.user_id, loginId, role: profile.role, approvalStatus: profile.approval_status } });
}
