import { createClient } from "@supabase/supabase-js";
import { fail, ok } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recoveryCredential, validateResetPassword } from "@/lib/validation/password-recovery";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "올바른 페이지에서 다시 요청해주세요.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다.");
  const validation = validateResetPassword(body.password, body.passwordConfirm);
  if (validation) return fail("INVALID_PASSWORD", validation);
  const credential = recoveryCredential(body);
  if (!credential) return fail("RECOVERY_REQUIRED", "재설정 메일의 링크를 열어주세요.", 401);
  // A fresh, isolated client prevents an unrelated existing login from authorizing a reset.
  const supabase = credential.kind === "code" ? await createSupabaseServerClient() :
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const verified = credential.kind === "token-hash" ? await supabase.auth.verifyOtp({ token_hash: credential.tokenHash, type: "recovery" }) :
    credential.kind === "code" ? await supabase.auth.exchangeCodeForSession(credential.code) :
      await supabase.auth.setSession({ access_token: credential.accessToken, refresh_token: credential.refreshToken });
  if (verified.error || !verified.data.user) return fail("INVALID_RECOVERY_LINK", "링크가 만료되었거나 이미 사용되었습니다. 재설정 메일을 다시 요청해주세요.", 401);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return fail("INVALID_RECOVERY_LINK", "재설정 인증을 확인하지 못했습니다. 메일을 다시 요청해주세요.", 401);
  const { error } = await supabase.auth.updateUser({ password: body.password as string });
  if (error) {
    await supabase.auth.signOut({ scope: "local" });
    return fail("PASSWORD_RESET_FAILED", "변경하지 못했습니다. 다른 비밀번호로 새 재설정 메일을 요청해주세요.", 400);
  }
  await supabase.auth.signOut();
  return ok({ changed: true });
}
