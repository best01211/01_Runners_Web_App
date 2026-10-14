import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { loadRegularTemplates } from "@/lib/regular-run-templates-server";
import { RegularTemplateManager } from "@/components/schedules/regular-template-manager";
export default async function RegularTemplatesPage() {
  const profile = await getCurrentProfile();
  if (!isStaffOrAdmin(profile)) redirect("/schedules");
  const templates = await loadRegularTemplates();
  return <main className="mx-auto w-full max-w-4xl px-6 py-12"><header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">정기런 양식 관리</h1><Link data-maintenance-blocked={Boolean(profile?.service_blocked?.scheduleCreation)} href="/schedules/new" className="min-h-11 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">일정 만들기</Link></header><p className="mt-4 text-zinc-600">관리자와 운영진이 정기런 양식을 추가·수정·삭제합니다. 날짜와 시간은 일정을 만들 때 입력합니다.</p><p className="mt-2 text-sm text-zinc-500">양식 정보 수정은 새 일정에 불러올 기본값에 적용됩니다. 사진 교체는 해당 양식을 사용하는 기존 일정에도 반영됩니다.</p><RegularTemplateManager templates={templates} /></main>;
}
