"use client";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { recoveryCredential, validateResetPassword } from "@/lib/validation/password-recovery";

export function ResetPasswordForm() {
  const initialized = useRef(false);
  const [credentials, setCredentials] = useState<Record<string, string> | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const value = { type: query.get("type") ?? hash.get("type") ?? (query.has("code") ? "recovery" : ""),
      tokenHash: query.get("token_hash") ?? hash.get("token_hash") ?? "", code: query.get("code") ?? "",
      accessToken: hash.get("access_token") ?? "", refreshToken: hash.get("refresh_token") ?? "" };
    setCredentials(recoveryCredential(value) ? value : null);
    // Remove credentials from the address bar before loading any further resources.
    window.history.replaceState(null, "", "/auth/reset-password");
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateResetPassword(password, confirmation);
    if (validation) { setError(validation); return; }
    if (!credentials) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, password, passwordConfirm: confirmation }) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "재설정하지 못했습니다.");
        if (response.status === 401 || result.error?.code === "PASSWORD_RESET_FAILED") setCredentials(null);
      } else {
        setPassword(""); setConfirmation(""); setCredentials(null); setDone(true);
        await fetch("/api/auth/logout", { method: "POST" });
      }
    } catch { setError("서버에 연결하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <section className="w-full max-w-md rounded-2xl border bg-white p-6 text-zinc-900 shadow-sm sm:p-8">
    <h1 className="text-2xl font-bold">새 비밀번호 설정</h1>
    {done ? <><p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">비밀번호를 변경했습니다. 새 비밀번호로 로그인해주세요.</p><Link href="/login?passwordReset=1" className="mt-5 block rounded-xl bg-emerald-600 p-3 text-center font-bold text-white">로그인하기</Link></> : <>
      <p className="mt-3 text-sm leading-6 text-zinc-600">영문과 숫자를 포함한 8~72자의 새 비밀번호를 입력해주세요.</p>
      {!credentials && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">유효한 재설정 메일의 링크가 필요합니다. 주소를 직접 열거나 새로고침했다면 메일을 다시 요청해주세요.</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label htmlFor="new-password" className="block text-sm font-semibold">새 비밀번호<input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} className="input mt-2" disabled={!credentials || busy} /></label>
        <label htmlFor="password-confirm" className="block text-sm font-semibold">새 비밀번호 확인<input id="password-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="input mt-2" disabled={!credentials || busy} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || !credentials} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-40">{busy ? "변경 중…" : "비밀번호 변경"}</button>
      </form>
      <Link href="/auth/forgot-password" className="mt-5 inline-block text-sm font-semibold text-emerald-700">재설정 메일 다시 요청</Link>
    </>}
  </section>;
}
