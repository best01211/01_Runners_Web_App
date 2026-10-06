"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/password-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json();
      if (!response.ok) setError(result.error?.message ?? "메일을 보내지 못했습니다.");
      else setMessage(result.data.message);
    } catch { setError("서버에 연결하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <section className="w-full max-w-md rounded-2xl border bg-white p-6 text-zinc-900 shadow-sm sm:p-8">
    <h1 className="text-2xl font-bold">비밀번호 찾기</h1>
    <p className="mt-3 text-sm leading-6 text-zinc-600">01Runners 회원가입 때 사용한 이메일로 재설정 링크를 보내드립니다.</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-semibold" htmlFor="recovery-email">가입 이메일</label>
      <input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} className="input" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">{message}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">{busy ? "요청 중…" : "재설정 메일 보내기"}</button>
    </form>
    <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-emerald-700">← 로그인으로</Link>
  </section>;
}
