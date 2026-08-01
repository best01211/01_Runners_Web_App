"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovalActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  async function submit(decision: "approve" | "reject") {
    if (decision === "reject" && reason.trim().length < 2) { setMessage("거절 사유를 입력해 주세요."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/staff/members/${userId}/approval`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim(), allowReapplication: true }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error?.message ?? "처리에 실패했습니다."); return; }
      router.refresh();
    } catch { setMessage("서버와 통신하지 못했습니다."); }
    finally { setLoading(false); }
  }

  return <div className="w-full space-y-3 md:w-72">
    <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="거절 사유" className="min-h-20 w-full rounded-xl border p-3 text-sm" disabled={loading} />
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => submit("approve")} disabled={loading} className="rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white">승인</button>
      <button onClick={() => submit("reject")} disabled={loading} className="rounded-xl border border-red-300 px-4 py-2.5 font-semibold text-red-700">거절</button>
    </div>
    {message && <p className="text-sm text-red-600">{message}</p>}
  </div>;
}
