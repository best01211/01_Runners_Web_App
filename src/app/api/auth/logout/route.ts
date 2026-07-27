import { fail, ok } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST() {
  const { error } = await (await createSupabaseServerClient()).auth.signOut();
  return error ? fail("LOGOUT_FAILED", "로그아웃에 실패했습니다.", 500) : ok({ loggedOut: true });
}
