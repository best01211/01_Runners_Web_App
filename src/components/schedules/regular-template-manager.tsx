"use client";
import Image from "next/image";
import Link from "next/link";
import {useState} from "react";
import {useRouter} from "next/navigation";
import type {RegularRunTemplate} from "@/lib/regular-run-templates";

export function RegularTemplateManager({templates}:{templates:RegularRunTemplate[]}){
 const router=useRouter();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function remove(template: RegularRunTemplate) {
    if (busy || !confirm(`‘${template.name}’ 양식을 삭제할까요? 이미 만든 일정과 참가 기록은 유지됩니다.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/regular-run-templates/${template.template_id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "삭제하지 못했습니다.");
      setMessage("양식이 삭제되었습니다. 기존 일정은 유지됩니다."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
    finally { setBusy(false); }
  }
 return <div className="mt-6 space-y-5">
  <div className="flex justify-end"><Link href="/admin/templates/new" className="button-primary">양식 추가</Link></div>
  {message&&<p role="status" aria-live="polite" className="text-sm">{message}</p>}
  <section className="grid gap-4 sm:grid-cols-2" aria-label="정기런 양식 목록">{templates.map(template=><article key={template.template_id} className="min-w-0 rounded-2xl border bg-white p-4 [overflow-wrap:anywhere]">
   {template.image_url&&<Image unoptimized src={template.image_url} alt={`${template.name} 안내 사진`} width={600} height={340} className="mb-3 h-40 w-full rounded-xl object-contain"/>}
   <h3 className="font-bold">{template.name}</h3><p className="mt-2 text-sm text-zinc-600">{template.location} · {template.capacity?`${template.capacity}명`:'인원 제한 없음'}</p>
   <p className="mt-1 text-xs text-zinc-500">페이스 그룹 {template.pace_groups?.length??0}개</p>
   <div className="mt-4 flex flex-wrap gap-2"><Link href={`/admin/templates/${template.template_id}/edit`} className="button-secondary">수정</Link><button type="button" disabled={busy} onClick={()=>void remove(template)} className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 disabled:opacity-50">삭제</button></div>
  </article>)}</section>
  {!templates.length&&<p className="py-8 text-center text-sm text-zinc-500">등록된 양식이 없습니다. ‘양식 추가’를 눌러 첫 정기런 양식을 만들어주세요.</p>}
 </div>;
}
