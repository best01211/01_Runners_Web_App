import { fail, ok } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSignup } from "@/lib/validation/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다."); }
  const parsed = validateSignup(body);
  if ("error" in parsed) return fail("VALIDATION_ERROR", parsed.error!);
  const v = parsed.value!;
  const admin = createSupabaseAdminClient();
  const { data: dup, error: dupError } = await admin.from("profiles").select("login_id,email,nickname").or([`login_id.eq.${v.loginId}`, `email.eq.${v.email}`, ...(v.nickname ? [`nickname.eq.${v.nickname}`] : [])].join(","));
  if (dupError) return fail("DATABASE_ERROR", "회원가입 확인 중 오류가 발생했습니다.", 500);
  if (dup?.some((r) => r.login_id === v.loginId)) return fail("LOGIN_ID_ALREADY_EXISTS", "이미 사용 중인 아이디입니다.", 409);
  if (dup?.some((r) => r.email === v.email)) return fail("EMAIL_ALREADY_EXISTS", "이미 사용 중인 이메일입니다.", 409);
  if (v.nickname && dup?.some((r) => r.nickname === v.nickname)) return fail("NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다.", 409);
  const supabase = await createSupabaseServerClient();
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: { emailRedirectTo: `${origin}/auth/callback`, data: { login_id: v.loginId, name: v.name, nickname: v.nickname, phone: v.phone, birth_date: v.birthDate } },
  });
  if (error) return fail("SIGNUP_FAILED", "회원가입에 실패했습니다.", 400);
  return ok({ userId: data.user?.id, approvalStatus: "pending", emailConfirmationRequired: data.session === null }, 201);
}
