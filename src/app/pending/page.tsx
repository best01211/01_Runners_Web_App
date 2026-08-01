import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";

export default async function PendingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.approval_status === "approved" && profile.role !== "pending" && profile.account_status === "active") redirect("/dashboard");
  const rejected = profile.approval_status === "rejected";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-emerald-600">01Runners</p>
        <h1 className="mt-3 text-3xl font-bold text-zinc-950">
          {rejected ? "가입 승인이 거절되었습니다" : "가입 승인 대기 중입니다"}
        </h1>
        <p className="mt-4 leading-7 text-zinc-600">
          {rejected ? "운영진 검토 결과 현재 가입이 승인되지 않았습니다." : "계정 생성은 완료되었습니다. 운영진 승인 후 서비스를 이용할 수 있습니다."}
        </p>
        <dl className="mt-8 space-y-4 rounded-2xl bg-zinc-50 p-5 text-sm">
          <div className="flex justify-between"><dt>아이디</dt><dd className="font-medium">{profile.login_id}</dd></div>
          <div className="flex justify-between"><dt>이름</dt><dd className="font-medium">{profile.name}</dd></div>
          <div className="flex justify-between"><dt>승인 상태</dt><dd className="font-medium">{profile.approval_status}</dd></div>
        </dl>
        <form action="/api/auth/logout" method="post" className="mt-8">
          <button type="submit" className="w-full rounded-xl bg-zinc-950 px-4 py-3 font-semibold text-white">로그아웃</button>
        </form>
      </section>
    </main>
  );
}
