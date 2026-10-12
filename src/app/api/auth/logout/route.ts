import { fail } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  const { error } = await (await createSupabaseServerClient()).auth.signOut();
  return error ? fail("LOGOUT_FAILED", "로그아웃에 실패했습니다.", 500) : NextResponse.redirect(new URL("/login", request.url), 303);
}
