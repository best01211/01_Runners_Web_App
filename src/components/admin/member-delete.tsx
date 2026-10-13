"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletionLabel, type DeletionPreview } from "@/lib/member-deletion";
export function MemberDelete({ userId, loginId, name, retry = false }: { userId: string; loginId: string; name: string; retry?: boolean }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [preview, setPreview] = useState<DeletionPreview | null>(null), [confirmation, setConfirmation] = useState(""), [message, setMessage] = useState("");
  async function inspect() {
    if (busy) return; setOpened(true); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/members/${userId}/deletion`), result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "삭제 정보를 확인하지 못했습니다.");
      setPreview(result.data.preview);
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !preview || confirmation.trim() !== (preview.loginId ?? loginId)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/members/${userId}/deletion`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) }), result = await response.json();
      if (!response.ok) { router.refresh(); throw new Error(result.error?.message ?? "삭제에 실패했습니다."); }
      setOpened(false); setPreview(null); setConfirmation(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다. 삭제 상태를 확인한 뒤 재시도해주세요."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3"><button disabled={busy} onClick={() => void inspect()} className="min-h-11 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-700">{retry ? "삭제 계속하기" : "사용자 정보·기록 삭제"}</button>
    {opened && <section aria-label={`${name} 사용자 삭제 확인`} className="mt-3 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="font-bold text-red-800">{name} ({preview?.loginId ?? loginId}) 삭제 확인</h3><p className="text-sm text-red-800">개인정보·참가·출석·작성 댓글·개인 대회 기록·사진·로그인 계정이 영구 삭제됩니다. 복구할 수 없습니다.</p><p className="text-sm text-zinc-700">공동 일정·대회와 다른 회원의 기록은 유지됩니다. 삭제 대상이 담당한 필수 작성자·운영자 연결은 처리 관리자에게 이전됩니다.</p>
      {busy && !preview && <p role="status">삭제 대상을 확인하는 중입니다…</p>}
      {preview && <><ul className="space-y-1 text-sm">{Object.entries(preview.counts).filter(([,count]) => count > 0).map(([key,count]) => <li key={key}>{deletionLabel(key)}: {count}건</li>)}<li>사진: {preview.storageFiles.length}개</li></ul>{preview.status !== "ready" && <p className="text-sm font-bold">DB 정리는 이미 완료됐습니다. 남은 사진·인증 계정 정리를 이어서 실행합니다.</p>}<label className="block text-sm font-bold">확인을 위해 아이디 ‘{preview.loginId ?? loginId}’를 입력해주세요<input disabled={busy} autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="input mt-2" /></label><button disabled={busy || confirmation.trim() !== (preview.loginId ?? loginId)} onClick={() => void remove()} className="min-h-11 rounded-xl bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-40">{busy ? "삭제 처리 중…" : "영구 삭제 실행"}</button></>}
      <button disabled={busy} onClick={() => { setOpened(false); setPreview(null); setConfirmation(""); setMessage(""); }} className="ml-2 min-h-11 rounded-xl border bg-white px-4 py-2">취소</button>{message && <p role="alert" className="text-sm text-red-800">{message}</p>}
    </section>}{!opened && message && <p role="alert" className="mt-2 text-sm text-red-700">{message}</p>}
  </div>;
}
