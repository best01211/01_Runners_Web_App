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
    <nav aria-label="이전 화면 이동" className="back-navigation">
      <div className="back-navigation-inner">
        <Link href={href} className="back-link">
          <span aria-hidden="true">←</span>
          뒤로가기
        </Link>
      </div>
    </nav>
  );
}
