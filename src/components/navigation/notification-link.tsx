'use client';
import Link from 'next/link';
import {Icon} from '@/components/ui/icon';
import {useEffect,useState} from 'react';
export function NotificationLink(){
 const [count,setCount]=useState(0);
 useEffect(()=>{let alive=true;const controller=new AbortController();const load=async()=>{if(document.visibilityState!=='visible')return;try{const r=await fetch('/api/notifications?summary=1',{cache:'no-store',signal:controller.signal});const j=await r.json();if(alive&&r.ok&&j.success)setCount(j.data.unreadCount);}catch{}};void load();const timer=setInterval(()=>void load(),60000);const update=()=>void load();window.addEventListener('notifications-updated',update);return()=>{alive=false;controller.abort();clearInterval(timer);window.removeEventListener('notifications-updated',update);};},[]);
 return <Link className="header-notification inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-sm font-bold" href="/notifications" aria-label={count?`알림 ${count}개 읽지 않음`:'알림'}><Icon name="bell" size={18}/><span className="header-notification-label">알림</span>{count>0&&<span className="header-notification-count rounded-full bg-emerald-700 px-2 py-0.5 text-xs text-white">{count>99?'99+':count}</span>}</Link>;
}
