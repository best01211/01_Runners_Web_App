import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const actor = await getCurrentProfile();
  if (!actor) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  if (!isStaffOrAdmin(actor)) return fail("FORBIDDEN", "운영 권한이 필요합니다.", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("profiles")
    .select("user_id,login_id,email,name,nickname,phone,birth_date,created_at,approval_status")
    .eq("role", "pending").eq("approval_status", "pending").order("created_at");
  if (error) return fail("DATABASE_ERROR", "대기 회원 조회에 실패했습니다.", 500);
  return ok({ members: data });
}
