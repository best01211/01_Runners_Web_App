import Link from "next/link";
import { TrackingTabs } from "@/components/race-tracking/tracking-tabs";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { TrackingDemo } from "@/components/race-tracking/tracking-demo";

export const metadata = { title: "선수 추적 데모 | 01Runners" };
export default async function TrackingDemoPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.account_status !== "active") redirect("/account-status");
  if (profile.approval_status !== "approved" || profile.role === "pending") redirect("/pending");
  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6">
    <Link href="/dashboard" className="text-sm font-semibold text-emerald-700">← 대시보드</Link>
    <TrackingTabs active="demo" admin={profile.role === "admin"}/><TrackingDemo />
  </main>;
}
