import { ResetPasswordForm } from "@/components/auth/reset-password-form";
export const metadata = { title: "비밀번호 재설정 | 01Runners", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function ResetPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10"><ResetPasswordForm /></main>;
}
