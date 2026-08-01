import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";

export default async function AccountStatusPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-red-600">계정 이용 제한</p>
        <h1 className="mt-3 text-3xl font-bold">현재 서비스를 이용할 수 없습니다</h1>
        <p className="mt-4 text-zinc-600">현재 계정 상태는 <strong>{profile.account_status}</strong>입니다.</p>
        <form action="/api/auth/logout" method="post" className="mt-8">
          <button type="submit" className="w-full rounded-xl bg-zinc-950 px-4 py-3 font-semibold text-white">로그아웃</button>
        </form>
      </section>
    </main>
  );
}
