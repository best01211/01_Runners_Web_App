"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ServiceAccessMonitor() {
  const pathname = usePathname();
  useEffect(() => {
    if (["/", "/login", "/signup"].includes(pathname) || pathname.startsWith("/auth/")) return;
    let disposed = false;
    let checking = false;
    const controller = new AbortController();
    async function check() {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch("/api/auth/service-status", { cache: "no-store", signal: controller.signal });
        if (!response.ok && response.status !== 401) return;
        const { destination } = await response.json();
        const allowed = ["/maintenance", "/account-status", "/pending", "/login"];
        if (!disposed && allowed.includes(destination) && destination !== pathname) window.location.replace(destination);
      } catch {
        // Retry on the next interval or when returning to the tab.
      } finally { checking = false; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 10000);
    const resume = () => void check();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [pathname]);
  return null;
}
