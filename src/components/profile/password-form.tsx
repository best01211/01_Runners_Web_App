"use client";
import { FormEvent, useState } from "react";
export function PasswordForm({readOnly=false}:{readOnly?:boolean}) {
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy||readOnly) return;
    const values = new FormData(event.currentTarget);
    if (values.get("newPassword") !== values.get("confirmPassword")) return setMessage("새 비밀번호 확인이 일치하지 않습니다.");
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/profile/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: values.get("currentPassword"), newPassword: values.get("newPassword") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "변경에 실패했습니다.");
      location.href = "/login?passwordChanged=1";
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <form data-maintenance-blocked={readOnly} onSubmit={submit} className="mt-10 space-y-3 border-t pt-8"><h2 className="font-bold">비밀번호 변경</h2><p className="text-sm text-zinc-500">영문과 숫자를 포함한 8~72자. 변경 후 다시 로그인해주세요.</p><fieldset disabled={busy} className="space-y-3 disabled:opacity-60"><label className="block text-sm">현재 비밀번호<input name="currentPassword" type="password" required autoComplete="current-password" className="input mt-2" /></label><label className="block text-sm">새 비밀번호<input name="newPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input mt-2" /></label><label className="block text-sm">새 비밀번호 확인<input name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input mt-2" /></label><button data-maintenance-blocked={readOnly} className="min-h-11 rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white">{busy ? "변경 중…" : "비밀번호 변경"}</button></fieldset>{message && <p role="alert" className="text-sm text-red-600">{message}</p>}</form>;
}
