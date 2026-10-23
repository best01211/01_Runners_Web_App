"use client";

import {requestFeature} from "@/lib/service-policy";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function ServiceAccessMonitor() {
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  useEffect(() => { currentPath.current = pathname; }, [pathname]);
  const publicPage = ["/", "/login", "/signup"].includes(pathname) || pathname.startsWith("/auth/");
  useEffect(() => {
    if (publicPage) return;
    let disposed = false;
    let checking = false;
    const controller = new AbortController();
    let lastCheck = 0;
    async function check(force = false) {
      if (checking || document.visibilityState !== "visible" || (!force && Date.now() - lastCheck < 1000)) return;
      lastCheck = Date.now();
      checking = true;
      try {
        const response = await fetch("/api/auth/service-status", { cache: "no-store", signal: controller.signal });
        if (!response.ok && response.status !== 401) return;
        const { destination, profile, blockedFeatures } = await response.json();
        const feature=requestFeature(currentPath.current,"GET");
        if(!disposed&&feature&&blockedFeatures?.[feature]){window.location.replace("/maintenance");return;}
        if (!disposed) window.dispatchEvent(new CustomEvent("service-identity", { detail: profile ?? null }));
        const allowed = ["/maintenance", "/account-status", "/pending", "/login"];
        if (!disposed && allowed.includes(destination) && destination !== currentPath.current) window.location.replace(destination);
      } catch {
        // Retry on the next interval or when returning to the tab.
      } finally { checking = false; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 10000);
    const resume = () => void check();
    const profileUpdated = () => void check(true);
    window.addEventListener("profile-updated", profileUpdated);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("profile-updated", profileUpdated);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [publicPage, pathname]);
  return null;
}
