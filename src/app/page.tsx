import Link from "next/link";

export default function Home() {
  return <main className="flex min-h-screen items-center justify-center bg-emerald-950 px-6 text-white">
    <section className="max-w-3xl text-center">
      <p className="font-bold text-emerald-300">RUN TOGETHER</p>
      <h1 className="mt-4 text-6xl font-black">01Runners</h1>
      <p className="mt-6 text-xl text-emerald-100">일정, 참가, 출석과 활동 기록을 한곳에서 관리하세요.</p>
      <div className="mt-10 flex justify-center gap-3"><Link href="/login" className="rounded-xl bg-white px-6 py-3 font-bold text-emerald-950">로그인</Link><Link href="/signup" className="rounded-xl border border-white/40 px-6 py-3 font-bold">회원가입</Link></div>
    </section>
  </main>;
}
