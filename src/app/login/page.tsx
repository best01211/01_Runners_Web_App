"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
        setErrorMessage(result.message ?? "로그인에 실패했습니다.");
        return;
      }

      const nextPath = searchParams.get("next") ?? "/dashboard";

      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("서버와 통신하는 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          01Runners 로그인
        </h1>

        <p className="mt-2 text-center text-sm text-gray-500">
          가입한 아이디와 비밀번호를 입력해 주세요.
        </p>

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
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-gray-900"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-gray-900"
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}