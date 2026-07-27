import { fail, ok } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("INVALID_EMAIL", "올바른 이메일을 입력해 주세요.");
  const { data, error } = await createSupabaseAdminClient().from("profiles").select("user_id").eq("email", email).maybeSingle();
  if (error) return fail("DATABASE_ERROR", "중복 확인 중 오류가 발생했습니다.", 500);
  return ok({ available: data === null });
}
