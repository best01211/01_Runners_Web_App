import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/auth/callback", "/auth/forgot-password", "/auth/reset-password"]);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico";
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  // Recovery routes must remain reachable even for pending or restricted accounts.
  if (["/auth/forgot-password", "/auth/reset-password", "/auth/callback"].includes(pathname)) return response;

  if (!user) {
    if (isPublicPath(pathname)) return response;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,approval_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    if (pathname === "/pending" || pathname.startsWith("/api/auth/")) return response;
    return NextResponse.redirect(new URL("/pending", request.url));
  }

  if (["restricted", "suspended", "withdrawn"].includes(profile.account_status)) {
    if (pathname === "/account-status" || pathname.startsWith("/api/auth/")) return response;
    return NextResponse.redirect(new URL("/account-status", request.url));
  }

  const approved = profile.approval_status === "approved" && profile.role !== "pending";
  if (!approved) {
    if (pathname === "/pending" || pathname.startsWith("/api/auth/")) return response;
    return NextResponse.redirect(new URL("/pending", request.url));
  }

  const { data: maintenance } = await supabase.from("system_settings").select("setting_value").eq("setting_key", "maintenance").maybeSingle();
  const serviceStatus = String((maintenance?.setting_value as { status?: string } | null)?.status ?? "normal");
  if (serviceStatus !== "normal" && profile.role !== "admin") {
    if (pathname === "/maintenance" || pathname.startsWith("/api/auth/")) return response;
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }
  if (pathname === "/maintenance" && serviceStatus === "normal") return NextResponse.redirect(new URL("/dashboard", request.url));

  if (["/pending", "/login", "/signup"].includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
