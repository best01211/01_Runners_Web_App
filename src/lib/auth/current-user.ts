import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  user_id: string;
  login_id: string;
  name: string;
  nickname: string | null;
  role: "pending" | "guest" | "member" | "staff" | "admin";
  account_status: "active" | "restricted" | "suspended" | "withdrawn";
  approval_status: "pending" | "approved" | "rejected" | "cancelled";
};

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("user_id,login_id,name,nickname,role,account_status,approval_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getCurrentProfile failed:", error);
    return null;
  }
  return data as CurrentProfile | null;
}

export function isStaffOrAdmin(profile: CurrentProfile | null) {
  return profile?.account_status === "active" &&
    profile.approval_status === "approved" &&
    (profile.role === "staff" || profile.role === "admin");
}
