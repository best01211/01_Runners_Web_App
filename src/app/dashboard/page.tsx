import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div><p className="text-sm font-semibold text-emerald-600">01Runners</p><h1 className="mt-2 text-3xl font-bold">{profile.nickname ?? profile.name}님, 환영합니다</h1></div>
        <form action="/api/auth/logout" method="post"><button className="rounded-xl border px-4 py-2 text-sm font-semibold">로그아웃</button></form>
      </header>
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border p-6"><h2 className="text-lg font-bold">회원 정보</h2><p className="mt-3 text-zinc-600">역할: {profile.role} · 승인: {profile.approval_status}</p></article>
        <Link href="/schedules" className="rounded-2xl border p-6"><h2 className="text-lg font-bold">일정</h2><p className="mt-3 text-zinc-600">러닝과 이벤트를 확인합니다.</p></Link>
        <Link href="/leaderboard" className="rounded-2xl border p-6"><h2 className="text-lg font-bold">랭킹</h2><p className="mt-3 text-zinc-600">시즌 활동 순위를 확인합니다.</p></Link>
        <Link href="/profile" className="rounded-2xl border p-6"><h2 className="text-lg font-bold">내 정보</h2><p className="mt-3 text-zinc-600">개인정보와 프로필을 관리합니다.</p></Link>
        {isStaffOrAdmin(profile) && <Link href="/staff/members/pending" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h2 className="text-lg font-bold">가입 승인 관리</h2><p className="mt-3">승인 대기 회원을 확인합니다.</p></Link>}
        {profile.role === "admin" && <Link href="/admin" className="rounded-2xl bg-zinc-950 p-6 text-white"><h2 className="text-lg font-bold">관리자</h2><p className="mt-3 text-zinc-300">회원과 운영 정책을 관리합니다.</p></Link>}
      </section>
    </main>
  );
}
