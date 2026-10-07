import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
 let body;
 try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
 const currentPassword = String(body?.currentPassword ?? ""), password = String(body?.newPassword ?? "");
 if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return fail("INVALID_PASSWORD", "새 비밀번호는 영문과 숫자를 포함한 8~72자여야 합니다.");
 const { data, error: lookupError } = await createSupabaseAdminClient().auth.admin.getUserById(profile.user_id);
 if (lookupError || !data.user?.email) return fail("PROFILE_NOT_FOUND", "인증 정보를 찾을 수 없습니다.", 404);
 const client = await createSupabaseServerClient();
 const verified = await client.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
 if (verified.error) return fail("INVALID_CURRENT_PASSWORD", "현재 비밀번호가 올바르지 않습니다.", 401);
 const { error } = await client.auth.updateUser({ password });
 if (error) return fail("PASSWORD_UPDATE_FAILED", "비밀번호 변경에 실패했습니다.", 500);
 await client.auth.signOut();
 return ok({ changed: true });
}
