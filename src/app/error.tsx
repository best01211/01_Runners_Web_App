"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto w-full max-w-xl px-6 py-16"><h1 className="text-2xl font-bold">화면을 불러오지 못했습니다</h1><p className="mt-4 text-zinc-600">일시적인 연결 문제일 수 있습니다. 잠시 후 다시 시도해주세요.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={reset} className="min-h-11 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">다시 시도</button><Link href="/dashboard" className="min-h-11 rounded-xl border px-5 py-3">대시보드</Link></div></main>;
}
