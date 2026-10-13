"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function parentPath(pathname: string): string | null {
  if (pathname === "/" || pathname === "/dashboard" || pathname === "/login" || ["/pending", "/account-status", "/maintenance"].includes(pathname)) return null;
  if (pathname === "/signup" || pathname.startsWith("/auth/")) return "/login";
  if (pathname.startsWith("/schedules/")) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 2) return `/schedules/${parts[1]}`;
    return "/schedules";
  }
  if (pathname.startsWith("/tracking/")) return "/tracking";
  if (pathname.startsWith("/admin/")) return "/admin";
  return "/dashboard";
}

export function BackNavigation() {
  const pathname = usePathname();
  const href = parentPath(pathname);
  if (!href) return null;

  return (
    <nav aria-label="이전 화면 이동" className="border-b border-zinc-200 bg-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-3">
        <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
          <span aria-hidden="true">←</span>
          뒤로가기
        </Link>
      </div>
    </nav>
  );
}
