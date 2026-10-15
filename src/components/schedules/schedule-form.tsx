"use client";
import Image from "next/image";
import Link from "next/link";
import { koreaDateTimeInput } from "@/lib/korea-time";
import type { RegularRunTemplate, TemplatePaceGroup } from "@/lib/regular-run-templates";
import { PaceGroupEditor } from "@/components/schedules/pace-group-editor";
import { parsePaceGroups } from "@/lib/regular-run-templates";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {DateTimeField} from "./date-time-field";
type Initial = Record<string, unknown> & { schedule_id?: string };
export function ScheduleForm({ initial, canManageTypes = false, templates = [] }: { initial?: Initial; canManageTypes?: boolean; templates?: RegularRunTemplate[] }) {
  const router = useRouter();
  const editing = Boolean(initial?.schedule_id);
  const [groups, setGroups] = useState<TemplatePaceGroup[]>([]);
  const [message, setMessage] = useState(""), [loading, setLoading] = useState(false);
  const [type, setType] = useState(String(initial?.schedule_type ?? (canManageTypes ? "regular" : "flash")));
  const [eventKind,setEventKind]=useState(String(initial?.event_kind??'gathering'));
  const [templateId, setTemplateId] = useState(String(initial?.regular_template_id ?? ""));
  const [title, setTitle] = useState(String(initial?.title ?? "")), [description, setDescription] = useState(String(initial?.description ?? ""));
  const [location, setLocation] = useState(String(initial?.location ?? "")), [capacity, setCapacity] = useState(String(initial?.capacity ?? ""));
  const template = templates.find(item => item.template_id === templateId);
  function changeType(next:string){
    if(next===type)return;
    if(!editing){setTitle("");setDescription("");setLocation("");setCapacity("");setGroups([]);}
    else if(templateId){setTitle("");setDescription("");setLocation("");setCapacity("");}
    setTemplateId("");setEventKind("gathering");setGroups([]);setType(next);setMessage("일정 유형이 변경되어 양식 정보를 초기화했습니다. 날짜와 모집 기간은 유지됩니다.");
  }
  function loadTemplate() {
    if (!template) return;
    if (!editing) setGroups((template.pace_groups ?? []).map(group => ({...group})));
    setTitle(template.name); setDescription(template.description); setLocation(template.location); setCapacity(String(template.capacity ?? ""));
    setMessage("양식을 불러왔습니다. 날짜·시간과 모집 기간을 입력해주세요.");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading) return;
    const values = new FormData(event.currentTarget);
    if (!editing && !parsePaceGroups(groups)) return setMessage("페이스 그룹은 중복 없이 30초·5km 단위로 입력해주세요.");
    if (!editing && type === "regular" && !groups.length) return setMessage("정기런에는 페이스 그룹을 한 개 이상 추가해주세요.");
    setLoading(true); setMessage("");
    try {
      const body = { ...(!editing ? {paceGroups:groups} : {}), title, description, location, capacity, scheduleType: type,eventKind:type==="event"?eventKind:null, regularTemplateId: type === "regular" ? templateId || null : null, startAt: values.get("startAt"), endAt: values.get("endAt"), registrationStartAt: values.get("registrationStartAt"), registrationEndAt: values.get("registrationEndAt"), guestAllowed: values.get("guestAllowed") === "on", commentEnabled: values.get("commentEnabled") === "on", staffInCapacity: values.get("staffInCapacity") === "on" };
      const response = await fetch(editing ? `/api/schedules/${initial?.schedule_id}` : "/api/schedules", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "저장에 실패했습니다.");
      router.push(`/schedules/${result.data.schedule.schedule_id}`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
    finally { setLoading(false); }
  }
  return <form aria-busy={loading} onSubmit={submit}><fieldset disabled={loading} className="space-y-5 disabled:opacity-60">
    <label className="block text-sm font-semibold">일정 유형<select name="scheduleType" value={type} onChange={event => changeType(event.target.value)} className="input mt-2">{canManageTypes && <><option value="regular">정기런</option><option value="training">훈련</option><option value="event">이벤트</option></>}<option value="flash">번개런</option></select></label>
    {type === "regular" && canManageTypes && <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><label className="block text-sm font-semibold">정기런 양식<select value={templateId} required={!editing || Boolean(initial?.regular_template_id)} onChange={event => setTemplateId(event.target.value)} className="input mt-2"><option value="">양식을 선택해주세요</option>{templates.map(item => <option key={item.template_id} value={item.template_id}>{item.name}{item.deleted_at ? " (삭제된 양식)" : ""}</option>)}</select></label><div className="flex flex-wrap gap-3"><button type="button" disabled={!template} onClick={loadTemplate} className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">기본 정보 불러오기</button><Link href="/admin?tab=templates" className="inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-bold">양식 추가·수정·삭제</Link></div><p className="text-sm text-zinc-600">선택한 양식의 사진을 재사용합니다. 기본 정보 불러오기를 누르면 페이스 그룹도 아래 편집기에 불러옵니다. 불러온 제목·설명·장소·정원은 이번 일정에 맞게 수정할 수 있습니다.</p>{Boolean(template?.pace_groups?.length)&&<ul className="space-y-1 text-sm">{template!.pace_groups!.map(group=><li key={`${group.paceSeconds}:${group.distanceKm}`}>{Math.floor(group.paceSeconds/60)}:{String(group.paceSeconds%60).padStart(2,"0")} / {group.distanceKm}km</li>)}</ul>}{template?.image_url && <Image unoptimized src={template.image_url} alt={`${template.name} 안내 사진`} width={800} height={450} className="max-h-64 w-full rounded-xl object-contain" />}{!templates.length && <p className="text-sm text-amber-800">먼저 정기런 양식을 등록해주세요.</p>}</section>}
    {type==='event'&&<section className="space-y-3 rounded-xl border bg-zinc-50 p-4"><label className="block text-sm font-semibold">이벤트 유형<select value={eventKind} onChange={e=>{setEventKind(e.target.value);setCapacity('');}} className="input mt-2"><option value="gathering">행사 이벤트 · 참석</option><option value="race">대회 이벤트 · 주자 / 응원단</option></select></label><p className="text-sm text-zinc-600">{eventKind==='race'?'주자·응원단으로 신청받으며 정원 제한이 없습니다.':'모집 시작부터 선착순으로 신청받습니다. 정원이 한 번 차면 일반 신청은 다시 열리지 않으며, 취소로 생긴 빈자리는 운영진이 추가합니다.'}</p></section>}
    <label className="block text-sm font-semibold">일정 제목<input value={title} onChange={event => setTitle(event.target.value)} required minLength={2} maxLength={100} className="input mt-2" /></label>
    <label className="block text-sm font-semibold">상세 설명<textarea value={description} onChange={event => setDescription(event.target.value)} rows={5} className="input mt-2" /></label>
    <label className="block text-sm font-semibold">장소<input value={location} onChange={event => setLocation(event.target.value)} required minLength={2} className="input mt-2" /></label>
    {!editing && type!=="event" && <PaceGroupEditor groups={groups} onChange={setGroups} />}
    {editing && type!=="event" && <p className="text-sm text-zinc-500">기존 참가자 배정을 보호하기 위해 페이스 그룹은 일정 상세 화면에서 관리해주세요.</p>}
    <div className="grid gap-4 sm:grid-cols-2"><Dt n="startAt" l="시작" v={koreaDateTimeInput(initial?.start_at)} /><Dt n="endAt" l="종료" v={koreaDateTimeInput(initial?.end_at)} /><Dt n="registrationStartAt" l="모집 시작" v={koreaDateTimeInput(initial?.registration_start_at)} optional={type!=="event"} /><Dt n="registrationEndAt" l="모집 종료" v={koreaDateTimeInput(initial?.registration_end_at)} /></div>
    {!(type==="event"&&eventKind==="race")&&<label className="block text-sm font-semibold">{type==="event"?"선착순 정원 (필수)":"정원 (선택)"}<input required={type==="event"} type="number" min={1} value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="비워두면 인원 제한 없음" className="input mt-2" /></label>}
    <div className="grid gap-3 text-sm sm:grid-cols-3"><Check n="guestAllowed" l="게스트 허용" v={Boolean(initial?.guest_allowed)} /><Check n="commentEnabled" l="댓글 사용" v={initial?.comment_enabled !== false} />{type!=="event"&&<Check n="staffInCapacity" l="운영진 정원 포함" v={initial?.staff_in_capacity !== false} />}</div>
    {type !== "regular" && <p className="text-sm text-zinc-500">이 일정은 사진 없이 등록됩니다.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}<button className="min-h-11 w-full rounded-xl bg-emerald-600 p-3 font-bold text-white">{loading ? "저장 중…" : editing ? "일정 수정" : "일정 생성"}</button>
  </fieldset></form>;
}
function Dt({ n, l, v, optional = false }: { n: string; l: string; v: string; optional?: boolean }) { return <DateTimeField name={n} label={l} initial={v} optional={optional}/>; }
function Check({ n, l, v }: { n: string; l: string; v: boolean }) { return <label><input type="checkbox" name={n} defaultChecked={v} /> {l}</label>; }
