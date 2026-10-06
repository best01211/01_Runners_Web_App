import Link from "next/link";
export function TrackingTabs({active,admin}:{active:"live"|"new"|"demo";admin:boolean}){
 const tabs=[{key:"live",label:"라이브 추적",href:"/tracking"},...(admin?[{key:"new",label:"대회 등록",href:"/tracking/new"}]:[]),{key:"demo",label:"가상 데모",href:"/tracking/demo"}];
 return <nav aria-label="추적 탭" className="mt-5 flex gap-2 overflow-x-auto border-b border-zinc-200 pb-3">{tabs.map(t=><Link key={t.key} href={t.href} aria-current={active===t.key?"page":undefined} className={`min-h-11 shrink-0 rounded-xl px-4 py-3 text-sm font-bold ${active===t.key?"bg-emerald-600 text-white":"bg-zinc-100 text-zinc-600"}`}>{t.label}</Link>)}</nav>;
}
