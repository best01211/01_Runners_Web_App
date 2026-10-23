"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
let started: number | null = null;
export function NavigationTiming() {
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (started !== null) {
      console.info(`[perf] navigation.commit ${(performance.now()-started).toFixed(1)}ms`);
      started = null;
    }
  }, [pathname]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin === location.origin && url.pathname !== location.pathname) started = performance.now();
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return null;
}
