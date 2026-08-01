"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CancelScheduleButtonProps = {
  scheduleId: string;
};

export function CancelScheduleButton({
  scheduleId,
}: CancelScheduleButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    const reason = window.prompt("일정 취소 사유를 입력해 주세요.") ?? "";

    const confirmed = window.confirm(
      "정말 이 일정을 취소하시겠습니까? 취소 후에는 수정할 수 없습니다.",
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: reason.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        window.alert(
          result.error?.message ?? "일정 취소 처리에 실패했습니다.",
        );
        return;
      }

      window.alert("일정이 취소되었습니다.");
      router.refresh();
    } catch (error) {
      console.error(error);
      window.alert("서버와 통신하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={loading}
      className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "처리 중..." : "일정 취소"}
    </button>
  );
}
