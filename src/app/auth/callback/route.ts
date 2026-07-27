import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) await (await createSupabaseServerClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/login?confirmed=1", url.origin));
}
