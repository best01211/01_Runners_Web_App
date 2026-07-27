import { fail, ok } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const { data, error } = await supabase.from("profiles").select("user_id,login_id,email,name,nickname,phone,birth_date,profile_image_url,role,account_status,approval_status,statistics_public").eq("user_id", user.id).single();
  if (error) return fail("PROFILE_NOT_FOUND", "회원 정보를 찾을 수 없습니다.", 404);
  return ok({ profile: data });
}
