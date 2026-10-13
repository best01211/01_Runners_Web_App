"use client";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPreparedImage, compressImage } from "@/lib/images/compress";
import type { RegularRunTemplate, TemplatePaceGroup } from "@/lib/regular-run-templates";

export function RegularTemplateManager({ templates }: { templates: RegularRunTemplate[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<TemplatePaceGroup[]>([]);
  const [selected, setSelected] = useState<RegularRunTemplate | null>(null);
  const [formKey, setFormKey] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  function choose(template: RegularRunTemplate | null) { setSelected(template); setGroups(template?.pace_groups ?? []); setFormKey(key => key + 1); setMessage(""); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, values = new FormData(form), file = values.get("image");
    setBusy(true); setMessage("");
    let persisted = false;
    try {
      // Validate/prepare the photo before creating a template, so invalid files do not create drafts.
      const photo = file instanceof File && file.size ? await compressImage(file, "regular") : null;
      const response = await fetch(selected ? `/api/regular-run-templates/${selected.template_id}` : "/api/regular-run-templates", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.get("name"), description: values.get("description"), location: values.get("location"), capacity: values.get("capacity"), paceGroups: groups, removeImage: values.get("removeImage") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "양식을 저장하지 못했습니다.");
      const saved = result.data.template as RegularRunTemplate;
      setSelected(saved); persisted = true;
      const imageUrl = photo ? await uploadPreparedImage(photo, "regular", saved.template_id) : saved.image_url;
      setSelected({ ...saved, image_url: imageUrl }); setFormKey(key => key + 1);
      setMessage("정기런 양식이 저장되었습니다. 일정 만들기에서 불러올 수 있습니다.");
      router.refresh();
    } catch (error) {
      setMessage(`${persisted ? "양식 정보는 저장됐지만 사진 저장에 실패했습니다. 같은 양식에서 다시 시도해주세요. " : ""}${error instanceof Error ? error.message : "서버와 통신하지 못했습니다."}`);
      if (persisted) router.refresh();
    } finally { setBusy(false); }
  }
  async function remove(template: RegularRunTemplate) {
    if (busy || !confirm(`‘${template.name}’ 양식을 삭제할까요? 이미 만든 일정과 참가 기록은 유지됩니다.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/regular-run-templates/${template.template_id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "삭제하지 못했습니다.");
      if (selected?.template_id === template.template_id) { setSelected(null); setFormKey(key => key + 1); }
      setMessage("양식이 삭제되었습니다. 기존 일정은 유지됩니다."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 space-y-8">
    <section className="grid gap-4 sm:grid-cols-2">{templates.map(template => <article key={template.template_id} className="rounded-2xl border p-4">{template.image_url && <Image unoptimized src={template.image_url} alt={`${template.name} 안내 사진`} width={600} height={340} className="mb-3 h-40 w-full rounded-xl object-contain" />}<h2 className="font-bold">{template.name}</h2><p className="mt-2 text-sm text-zinc-600">{template.location} · {template.capacity ? `${template.capacity}명` : "인원 제한 없음"}</p><div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => choose(template)} className="min-h-11 rounded-xl border px-4 py-2">수정</button><button disabled={busy} onClick={() => void remove(template)} className="min-h-11 rounded-xl border border-red-200 px-4 py-2 text-red-700">삭제</button></div></article>)}{!templates.length && <p className="text-zinc-500">아직 양식이 없습니다. 아래에서 첫 정기런 양식을 등록해주세요.</p>}</section>
    <section className="rounded-2xl border p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{selected ? "정기런 양식 수정" : "정기런 양식 추가"}</h2>{selected && <button disabled={busy} onClick={() => choose(null)} className="min-h-11 rounded-xl border px-4 py-2">새 양식 추가</button>}</div><form key={formKey} onSubmit={save} className="mt-5"><fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      <label className="block text-sm font-semibold">양식명<input name="name" required minLength={2} maxLength={100} defaultValue={selected?.name ?? ""} placeholder="예: 화요일 잠실 정기런" className="input mt-2" /></label>
      <label className="block text-sm font-semibold">장소<input name="location" required minLength={2} maxLength={200} defaultValue={selected?.location ?? ""} className="input mt-2" /></label>
      <label className="block text-sm font-semibold">기본 설명<textarea name="description" rows={5} maxLength={10000} defaultValue={selected?.description ?? ""} className="input mt-2" /></label>
      <label className="block text-sm font-semibold">기본 정원<input name="capacity" type="number" min={1} max={100000} defaultValue={selected?.capacity ?? ""} placeholder="비워두면 인원 제한 없음" className="input mt-2" /></label>
      <section className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">기본 페이스 그룹</h3><p className="text-sm text-zinc-500">30초 단위 페이스·5km 단위 거리로 등록합니다. 새 정기런 생성 시 함께 복사됩니다.</p>{groups.map((group,index)=><div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4"><label className="text-sm">페이스 분<input type="number" min={0} required value={Math.floor(group.paceSeconds/60)} onChange={event=>setGroups(items=>items.map((item,i)=>i===index?{...item,paceSeconds:Number(event.target.value)*60+item.paceSeconds%60}:item))} className="input mt-1" /></label><label className="text-sm">페이스 초<select value={group.paceSeconds%60} onChange={event=>setGroups(items=>items.map((item,i)=>i===index?{...item,paceSeconds:Math.floor(item.paceSeconds/60)*60+Number(event.target.value)}:item))} className="input mt-1"><option value={0}>00초</option><option value={30}>30초</option></select></label><label className="text-sm">거리 km<input type="number" min={5} step={5} required value={group.distanceKm} onChange={event=>setGroups(items=>items.map((item,i)=>i===index?{...item,distanceKm:Number(event.target.value)}:item))} className="input mt-1" /></label><button type="button" onClick={()=>setGroups(items=>items.filter((_,i)=>i!==index))} className="min-h-11 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700">그룹 삭제</button></div>)}<button type="button" disabled={groups.length>=20} onClick={()=>setGroups(items=>[...items,{paceSeconds:360,distanceKm:5}])} className="min-h-11 rounded-xl border px-4 py-2 font-semibold">그룹 추가</button>{!groups.length&&<p className="text-sm text-amber-700">등록한 그룹이 없으면 일정 생성 후 직접 추가해야 합니다.</p>}</section>
      {selected?.image_url && <Image unoptimized src={selected.image_url} alt="현재 양식 사진" width={600} height={340} className="max-h-64 w-full rounded-xl object-contain" />}
      <label className="block text-sm font-semibold">양식 사진 (선택)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block max-w-full" /></label><p className="text-sm text-zinc-500">한 번 등록한 사진을 매 일정에서 재사용합니다. 새 사진을 선택하면 기존 사진을 교체합니다.</p>
      {selected?.image_url && <label className="block text-sm"><input name="removeImage" type="checkbox" /> 사진 표시 제거</label>}
      <button className="min-h-11 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">{busy ? "저장 중…" : "양식 저장"}</button>
    </fieldset></form></section>{message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
  </div>;
}
