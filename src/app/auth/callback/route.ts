import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if(url.searchParams.get('flow')==='account-help'){
    const result=code?await(await createSupabaseServerClient()).auth.exchangeCodeForSession(code):null;
    return NextResponse.redirect(new URL(result&&!result.error?'/auth/account-help':'/auth/account-help?error=link',url.origin),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if (url.searchParams.get("flow") === "email-change") {
    // An unrelated session may already exist in the browser opening the email.
    // Show the outcome without sending that session to its dashboard via /login.
    const result = code && !url.searchParams.has("error")
      ? await (await createSupabaseServerClient()).auth.exchangeCodeForSession(code)
      : null;
    const destination = new URL("/auth/email-change", url.origin);
    destination.searchParams.set("result", result && !result.error ? "verified" : "check");
    return NextResponse.redirect(destination, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  if (!code) return NextResponse.redirect(new URL("/login?authError=1", url.origin));
  const { error } = await (await createSupabaseServerClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?authError=1" : "/login?confirmed=1", url.origin));
}
