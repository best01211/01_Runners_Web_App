"use client";

import { useLinkStatus } from "next/link";

export function NavigationProgress() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navigation-progress" role="status"><span className="sr-only">화면을 불러오는 중입니다</span></span> : null;
}
