"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ScheduleForm({ initial }: { initial?: any }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const editing = Boolean(initial?.schedule_id);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    const body = {
      title: formData.get("title"),
      description: formData.get("description"),
      scheduleType: formData.get("scheduleType"),
      location: formData.get("location"),
      startAt: formData.get("startAt"),
      registrationEndAt: formData.get("registrationEndAt"),
      capacity: formData.get("capacity"),
      guestAllowed: formData.get("guestAllowed") === "on",
      commentEnabled: formData.get("commentEnabled") === "on",
    };

    const response = await fetch(editing ? `/api/schedules/${initial.schedule_id}` : "/api/schedules", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(result.error?.message ?? "저장에 실패했습니다.");
    router.push(`/schedules/${result.data.schedule.schedule_id}`);
    router.refresh();
  }

  const local = (value?: string) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

  return <form action={submit} className="space-y-5">
    <input name="title" defaultValue={initial?.title} placeholder="일정 제목" required className="w-full rounded-xl border p-3" />
    <select name="scheduleType" defaultValue={initial?.schedule_type ?? "regular"} className="w-full rounded-xl border p-3">
      <option value="regular">정기런</option><option value="training">훈련</option><option value="flash">번개런</option><option value="event">행사</option>
    </select>
    <textarea name="description" defaultValue={initial?.description} placeholder="일정 설명" rows={5} className="w-full rounded-xl border p-3" />
    <input name="location" defaultValue={initial?.location} placeholder="장소" required className="w-full rounded-xl border p-3" />
    <div className="grid gap-4 md:grid-cols-2">
      <label>시작 일시<input type="datetime-local" name="startAt" defaultValue={local(initial?.start_at)} required className="mt-2 w-full rounded-xl border p-3" /></label>
      <label>신청 마감<input type="datetime-local" name="registrationEndAt" defaultValue={local(initial?.registration_end_at)} required className="mt-2 w-full rounded-xl border p-3" /></label>
    </div>
    <input type="number" min="1" name="capacity" defaultValue={initial?.capacity ?? ""} placeholder="정원(선택)" className="w-full rounded-xl border p-3" />
    <div className="flex gap-6"><label><input type="checkbox" name="guestAllowed" defaultChecked={initial?.guest_allowed} /> 게스트 허용</label><label><input type="checkbox" name="commentEnabled" defaultChecked={initial?.comment_enabled ?? true} /> 댓글 사용</label></div>
    {message && <p className="text-red-600">{message}</p>}
    <button disabled={loading} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white">{loading ? "저장 중..." : editing ? "일정 수정" : "일정 생성"}</button>
  </form>;
}
