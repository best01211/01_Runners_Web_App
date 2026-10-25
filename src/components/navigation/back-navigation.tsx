"use client";

import Link from "next/link";
import { usePathname,useSearchParams,useRouter } from "next/navigation";
import {useEffect,useRef} from 'react';

function parentPath(pathname: string): string | null {
  if (pathname === "/" || pathname === "/dashboard" || pathname === "/login" || ["/pending", "/account-status", "/maintenance"].includes(pathname)) return null;
  if (pathname === "/signup" || pathname.startsWith("/auth/")) return "/login";
  if (pathname.startsWith("/schedules/")) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 2) return `/schedules/${parts[1]}`;
    return "/schedules";
  }
  if (pathname.startsWith("/tracking/")){const parts=pathname.split('/').filter(Boolean);return parts.length>2?`/tracking/${parts[1]}`:'/tracking';}
  if (pathname.startsWith("/admin/")) return "/admin";
  return "/dashboard";
}

export function BackNavigation() {
  const pathname = usePathname();
  const search=useSearchParams(),router=useRouter(),session=useRef(''),last=useRef('');
  useEffect(()=>{
    if(!session.current)session.current=crypto.randomUUID();
    const original=window.history.pushState;
    const push=(data:unknown,unused:string,url?:string|URL|null)=>{
      const marker=window.history.state?.runnersNavigation;
      const depth=marker?.session===session.current?marker.depth:0;
      return original.call(window.history,{...(data&&typeof data==='object'?data:{}),runnersNavigation:{session:session.current,depth:depth+1}},unused,url);
    };
    window.history.pushState=push;
    return()=>{if(window.history.pushState===push)window.history.pushState=original;};
  },[]);
  useEffect(()=>{
    const current=pathname+'?'+search.toString();if(last.current===current)return;
    const marker=window.history.state?.runnersNavigation;
    window.history.replaceState({...window.history.state,runnersNavigation:{session:session.current,depth:marker?.session===session.current?marker.depth:0}},'');last.current=current;
  },[pathname,search]);
  const href = parentPath(pathname);
  if (!href) return null;

  return (
    <nav aria-label="이전 화면 이동" className="back-navigation">
      <div className="back-navigation-inner">
        <Link href={href} className="back-link" onClick={event=>{const marker=window.history.state?.runnersNavigation;if(marker?.session===session.current&&marker.depth>0){event.preventDefault();router.back();}}}>
          <span aria-hidden="true">←</span>
          뒤로가기
        </Link>
      </div>
    </nav>
  );
}
