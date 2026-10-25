"use client";

import { Brand } from "@/components/navigation/app-shell";
import { Icon } from "@/components/ui/icon";
import { safeNextPath } from "@/lib/public-data";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">불러오는 중...</main>}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          loginId,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setErrorMessage(result.error?.message ?? "로그인에 실패했습니다.");
        return;
      }

      const nextPath = safeNextPath(searchParams.get("next"));

      router.replace(result.data?.nextPath??nextPath);
      router.refresh();
    } catch {
      setErrorMessage("서버와 통신하는 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <aside className="login-story"><div className="login-poster-meta"><span>2001 RUNNERS</span><span>크루 전용 공간</span></div><div className="login-poster-mark"><Brand light/><h2>RUNNERS</h2></div><div className="login-poster-footer"><span>함께 뛰는 일정과 기록.</span><span>↗</span></div></aside>
      <div className="login-form-area"><Link href="/login" className="login-mobile-brand" aria-label="01Runners"><Brand/></Link>
      <section className="login-card"><p className="eyebrow">회원 로그인</p>
        <h1 className="login-title">
          크루 로그인
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-500">
          이메일이 아닌 회원 아이디와 비밀번호를 입력해 주세요.
        </p>

        {searchParams.get("passwordChanged") === "1" && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.</p>}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="loginId"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              아이디
            </label>

            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
              placeholder="아이디"
              required
              className="input"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              비밀번호
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호"
              required
              className="input"
            />
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="button-primary w-full justify-center"
          >
            {isSubmitting ? "로그인 중..." : <>로그인<Icon name="arrow" size={18}/></>}
          </button>
        </form>
        {searchParams.get("signup") === "complete" && <p className="mt-4 text-sm text-emerald-700">가입 신청을 접수했어요. 받은 인증 메일을 먼저 확인해주세요. 로그인하면 운영진 승인 상태를 확인할 수 있습니다.</p>}
        {searchParams.get("confirmed") === "1" && <p className="mt-4 text-sm text-emerald-700">이메일 인증이 완료되었습니다.</p>}
        {searchParams.get("authError") && <p role="alert" className="mt-4 text-sm text-red-600">인증 링크가 만료되었거나 사용할 수 없습니다.</p>}
        <div className="login-signup"><span>아직 크루 회원이 아닌가요?</span><Link href="/signup">가입 신청<Icon name="arrow" size={14}/></Link></div>
        <Link href="/auth/forgot-password" className="mt-5 block text-center text-sm text-zinc-500 hover:text-emerald-700">비밀번호를 잊으셨나요?</Link>
        <Link href="/auth/account-help" className="mt-4 block text-center text-sm font-semibold text-emerald-700">아이디·가입 승인 상태 찾기</Link>
      </section><p className="login-bottom-note">2001 RUNNERS · 회원 전용</p></div>
    </main>
  );
}
