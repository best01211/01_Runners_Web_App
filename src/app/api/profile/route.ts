import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  let body;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
  if (!body || typeof body !== "object") return fail("INVALID_JSON", "입력값을 확인해주세요.");
  const client = await createSupabaseServerClient();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("INVALID_EMAIL", "이메일을 확인해주세요.");
  const phone = String(body.phone ?? "").trim(), nickname = String(body.nickname ?? "").trim();
  const image = String(body.profileImageUrl ?? "").trim();
  if (phone.length > 30 || nickname.length > 50 || image.length > 2048) return fail("INVALID_PROFILE", "입력값이 너무 깁니다.");
  const { error: saveError } = await client.rpc("update_own_profile", { payload: { phone, nickname: nickname || null, profile_image_url: image || null } });
  if (saveError) return fail("UPDATE_FAILED", "정보 수정에 실패했습니다. DB 설정과 닉네임 중복을 확인해주세요.", 409);
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) return fail("UNAUTHORIZED", "다시 로그인해주세요.", 401);
  if (identity.user.email?.toLowerCase() !== email) {
    const { error } = await client.auth.updateUser({ email }, { emailRedirectTo: `${new URL(request.url).origin}/auth/callback` });
    if (error) return fail("EMAIL_UPDATE_FAILED", "프로필은 저장했지만 이메일 변경 요청에 실패했습니다. 다시 시도해주세요.", 409);
    return ok({ message: "프로필을 저장했습니다. 이메일 변경은 확인 메일 인증 후 완료됩니다.", emailConfirmationRequired: true });
  }
  return ok({ message: "수정되었습니다.", emailConfirmationRequired: false });
}
