import { createClient } from "@supabase/supabase-js";
import { fail, ok } from "@/lib/api-response";
import { validateRecoveryEmail } from "@/lib/validation/password-recovery";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) return fail("FORBIDDEN", "올바른 페이지에서 다시 요청해주세요.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다.");
  const email = validateRecoveryEmail(body.email);
  if (!email) return fail("INVALID_EMAIL", "가입한 이메일 주소를 확인해주세요.");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset-password` });
  if (error) return fail("RECOVERY_UNAVAILABLE", "메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.", error.status === 429 ? 429 : 503);
  return ok({ message: "해당 이메일로 가입된 계정이 있다면 재설정 메일이 발송됩니다. 스팸함도 확인해주세요." });
}
