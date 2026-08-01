import { redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ApprovalActions } from "./approval-actions";

export default async function PendingMembersPage() {
  const actor = await getCurrentProfile();
  if (!actor) redirect("/login");
  if (!isStaffOrAdmin(actor)) redirect("/dashboard");

  const admin = createSupabaseAdminClient();
  const { data: members, error } = await admin.from("profiles")
    .select("user_id,login_id,email,name,nickname,phone,birth_date,created_at")
    .eq("role", "pending").eq("approval_status", "pending").order("created_at");
  if (error) throw new Error("승인 대기 회원을 불러오지 못했습니다.");

  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
    <p className="text-sm font-semibold text-emerald-600">운영진</p>
    <h1 className="mt-2 text-3xl font-bold">가입 승인 대기</h1>
    <p className="mt-3 text-zinc-600">총 {members?.length ?? 0}명</p>
    <div className="mt-8 space-y-4">
      {members?.length ? members.map((m) => <article key={m.user_id} className="rounded-2xl border bg-white p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div><h2 className="text-xl font-bold">{m.name}{m.nickname ? ` (${m.nickname})` : ""}</h2>
            <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2"><div>아이디: {m.login_id}</div><div>이메일: {m.email}</div><div>연락처: {m.phone ?? "-"}</div><div>생년월일: {m.birth_date}</div></div>
          </div><ApprovalActions userId={m.user_id} />
        </div>
      </article>) : <div className="rounded-2xl bg-zinc-50 p-10 text-center text-zinc-500">승인 대기 회원이 없습니다.</div>}
    </div>
  </main>;
}
