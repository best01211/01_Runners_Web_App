"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {useEffect,useState,type ReactNode} from "react";
import {canAdminister} from "@/lib/auth/account-access";
import {Icon,type IconName} from "@/components/ui/icon";
import {NavigationProgress} from "./navigation-progress";

const links:{href:string;label:string;icon:IconName}[]=[
  {href:"/dashboard",label:"크루 홈",icon:"home"},
  {href:"/schedules",label:"러닝 일정",icon:"calendar"},
  {href:"/leaderboard",label:"활동 랭킹",icon:"trophy"},
  {href:"/tracking",label:"라이브 추적",icon:"route"},
  {href:"/profile",label:"내 정보",icon:"user"},
];
type Identity={nickname:string|null;name:string;role:string;staff_position?:string|null;account_status:string;approval_status:string};
export function Brand({light=false}:{light?:boolean}) {
  return <span className={`brand ${light?"brand-light":""}`}><span className="brand-logo"><Image unoptimized priority src="/branding/01runners-logo.png" alt="2001 Runners — WE RUN AS ONE" width={1447} height={1447} className="brand-logo-image"/></span></span>;
}
export function AppShell({children}:{children:ReactNode}) {
  const pathname=usePathname();
  const publicPage=pathname==="/"||["/login","/signup","/pending","/maintenance","/account-status"].includes(pathname)||pathname.startsWith("/auth/");
  const [identity,setIdentity]=useState<Identity|null>(null);
  useEffect(()=>{
    if(publicPage)return;
    const receiveIdentity=(event:Event)=>setIdentity((event as CustomEvent<Identity|null>).detail);
    window.addEventListener('service-identity',receiveIdentity);
    return()=>{window.removeEventListener('service-identity',receiveIdentity);setIdentity(null)};
  },[publicPage]);
  if(publicPage)return <>{children}</>;
  const current=links.find(link=>pathname===link.href||pathname.startsWith(link.href+"/"));
  const name=identity?.nickname||identity?.name;
  const navLink=(link:typeof links[number])=><Link key={link.href} href={link.href} aria-current={current?.href===link.href?"page":undefined} className={current?.href===link.href?"shell-link is-active":"shell-link"}><Icon name={link.icon}/><span>{link.label}</span><NavigationProgress/></Link>;
  return <div className="app-shell">
    <header className="club-header"><div className="club-header-inner">
      <Link href="/dashboard" className="club-brand" aria-label="2001 Runners 홈"><Brand/><span>RUNNERS</span></Link>
      <nav aria-label="주 메뉴" className="desktop-nav">{links.map(navLink)}</nav>
      <div className="club-header-actions">
        {identity&&["staff","admin"].includes(identity.role)&&<details className="staff-menu"><summary>운영<Icon name="chevron" size={13}/></summary><nav aria-label="운영 메뉴"><Link href="/staff/members/pending">가입 승인</Link><Link href="/admin">{canAdminister(identity)?"크루 관리":"회원 조회"}</Link>{identity.role==="admin"&&<Link href="/admin/operations">관리자 · 운영 설정</Link>}</nav></details>}
        <Link href="/profile" className="shell-account" aria-label="내 정보"><span className="account-avatar">{name?.slice(0,1)||<Icon name="user" size={17}/>}</span><span className="account-name">{name||"내 정보"}</span></Link>
        <form action="/api/auth/logout" method="post"><button className="logout-button" aria-label="로그아웃" title="로그아웃"><Icon name="logout" size={18}/></button></form>
      </div>
    </div></header>
    <div className="shell-body"><div className="main-body">{children}</div>
      <footer className="shell-footer"><strong>2001 RUNNERS</strong><span>WE RUN AS ONE</span></footer>
    </div>
    <nav aria-label="모바일 주 메뉴" className="mobile-nav">{links.map(navLink)}</nav>
  </div>;
}
