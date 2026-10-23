import { measure, timedSupabaseFetch } from "@/lib/performance";
import {parseMaintenanceSetting,canAccessDuringService,requestFeature,featureBlocked,SERVICE_FEATURES} from "@/lib/service-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  return measure("proxy.total", () => runProxy(request));
}

async function runProxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timedSupabaseFetch },
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
  if (["/auth/forgot-password", "/auth/reset-password", "/auth/callback", "/auth/email-change"].includes(pathname)) return response;

  if (!user) {
    if (isPublicPath(pathname)) return response;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const [profileResult, withdrawalResult, maintenanceResult] = await Promise.all([
    supabase.from("profiles").select("role,account_status,approval_status,is_pacer,staff_position").eq("user_id", user.id).maybeSingle(),
    supabase.from("withdrawal_requests").select("request_id").eq("user_id",user.id).eq("status","pending").maybeSingle(),
    createSupabaseAdminClient().from("system_settings").select("setting_value").eq("setting_key", "maintenance").maybeSingle(),
  ]);
  const { data: profile } = profileResult;
  const { data: withdrawal, error: withdrawalError } = withdrawalResult;
  const { data: maintenance, error: maintenanceError } = maintenanceResult;

  if (!profile) {
    if (pathname === "/pending" || pathname.startsWith("/api/auth/")) return response;
    return NextResponse.redirect(new URL("/pending", request.url));
  }

  if (withdrawalError && !pathname.startsWith("/api/auth/")) return NextResponse.json({success:false,error:{code:"ACCOUNT_CHECK_FAILED",message:"계정 상태를 확인하지 못했습니다."}},{status:503});
  if (["suspended", "withdrawn"].includes(profile.account_status) || withdrawal) {
    if (pathname === "/account-status" || pathname.startsWith("/api/auth/")) return response;
    if(pathname.startsWith("/api/")) return NextResponse.json({success:false,error:{code:"ACCOUNT_UNAVAILABLE",message:"현재 서비스를 이용할 수 없는 계정입니다."}},{status:403});
    return NextResponse.redirect(new URL("/account-status", request.url));
  }

  const approved = profile.approval_status === "approved" && profile.role !== "pending";
  if (!approved) {
    if (pathname === "/pending" || pathname.startsWith("/api/auth/")) return response;
    return NextResponse.redirect(new URL("/pending", request.url));
  }

  if (profile.account_status === "restricted" && !pathname.startsWith("/api/auth/")) {
    if(pathname.startsWith("/api/")) {
      const permitted = ["GET","HEAD"].includes(request.method) ||
        (request.method === "PATCH" && ["/api/profile","/api/profile/password"].includes(pathname)) ||
        (request.method === "POST" && ["/api/uploads","/api/profile/withdrawal"].includes(pathname)) ||
        (request.method === "DELETE" && /^\/api\/schedules\/[^/]+\/participation$/.test(pathname)) ||
        (request.method === "DELETE" && /^\/api\/comments\/[^/]+$/.test(pathname)) ||
        (request.method === "POST" && /^\/api\/schedules\/[^/]+\/attendance$/.test(pathname));
      if(!permitted) return NextResponse.json({success:false,error:{code:"ACTIVITY_RESTRICTED",message:"제한 상태에서는 신규 신청과 활동 등록을 할 수 없습니다."}},{status:403});
    } else if(pathname.startsWith("/admin") || pathname.startsWith("/staff") || pathname === "/schedules/new" || pathname === "/schedules/templates" || /\/edit$/.test(pathname) || pathname === "/tracking/new") {
      return NextResponse.redirect(new URL("/dashboard",request.url));
    }
  }
  if(pathname === "/account-status") return NextResponse.redirect(new URL("/dashboard",request.url));

  const setting=parseMaintenanceSetting(maintenance?.setting_value??{status:"normal"});
  if(maintenanceError||!setting)return NextResponse.json({success:false,error:{code:"SERVICE_CONFIG_ERROR",message:"서비스 설정을 확인하지 못했습니다."}},{status:503});
  const access=canAccessDuringService(setting,profile);
  if(!access && pathname!=="/maintenance" && !pathname.startsWith("/api/auth/")) {
    if(pathname.startsWith("/api/"))return NextResponse.json({success:false,error:{code:"SERVICE_ACCESS_BLOCKED",message:setting.message||"현재 등급은 서비스에 접속할 수 없습니다."}},{status:403});
    return NextResponse.redirect(new URL("/maintenance",request.url));
  }
  const feature=requestFeature(pathname,request.method);
  if(feature&&featureBlocked(setting,feature)){
    if(pathname.startsWith("/api/"))return NextResponse.json({success:false,error:{code:"SERVICE_FEATURE_BLOCKED",message:`관리자 설정으로 ${SERVICE_FEATURES[feature]} 상태입니다.`}},{status:403});
    return NextResponse.redirect(new URL("/maintenance",request.url));
  }
  if(pathname==="/maintenance"&&(setting.status==="normal"||(setting.status==="maintenance"&&access)))return NextResponse.redirect(new URL("/dashboard",request.url));

  if (["/pending", "/login", "/signup"].includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
