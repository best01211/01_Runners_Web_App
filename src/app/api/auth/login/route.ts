import {parseMaintenanceSetting,canAccessDuringService} from "@/lib/service-policy";
import { fail, ok } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "입력값을 확인해주세요.");
  const loginId = String(body.loginId ?? "").trim();
  const password = String(body.password ?? "");
  if (!loginId || !password) return fail("VALIDATION_ERROR", "아이디와 비밀번호를 입력해 주세요.");
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("user_id,email,role,account_status,approval_status,is_pacer,staff_position").eq("login_id", loginId).maybeSingle();
  if (error) return fail("DATABASE_ERROR", "로그인 처리 중 오류가 발생했습니다.", 500);
  if (!profile) return fail("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  if (profile.approval_status !== "approved" || profile.role === "pending") return fail("APPROVAL_REQUIRED", "회원 승인 후 로그인할 수 있습니다.", 403);
  if (!["active","restricted"].includes(profile.account_status)) return fail("ACCOUNT_UNAVAILABLE", "현재 이용할 수 없는 계정입니다.", 403);
  const {data:withdrawal,error:withdrawalError}=await admin.from("withdrawal_requests").select("request_id").eq("user_id",profile.user_id).eq("status","pending").maybeSingle();
  if(withdrawalError)return fail("DATABASE_ERROR","계정 상태를 확인하지 못했습니다.",500);
  if(withdrawal)return fail("WITHDRAWAL_PENDING","탈퇴 처리 대기 중인 계정입니다.",403);
  const {data:service,error:serviceError}=await admin.from("system_settings").select("setting_value").eq("setting_key","maintenance").maybeSingle();
  const serviceSetting=parseMaintenanceSetting(service?.setting_value??{status:"normal"});
  if(serviceError||!serviceSetting)return fail("SERVICE_CONFIG_ERROR","서비스 설정을 확인하지 못했습니다.",503);
  if(!canAccessDuringService(serviceSetting,profile))return fail("SERVICE_ACCESS_BLOCKED",serviceSetting.message||"현재 등급은 서비스에 접속할 수 없습니다.",403);
  const supabase = await createSupabaseServerClient();
  const { data: identity, error: identityError } = await admin.auth.admin.getUserById(profile.user_id);
  if (identityError || !identity.user?.email) return fail("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  const signed = await supabase.auth.signInWithPassword({ email: identity.user.email, password });
  if (signed.error || !signed.data.user) return fail("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("user_id", profile.user_id);
  return ok({ user: { userId: profile.user_id, loginId, role: profile.role, approvalStatus: profile.approval_status } });
}
