import {parseMaintenanceSetting,type ServiceFeature} from "@/lib/service-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canStartActivity } from "./account-access";
export { canUseService, canStartActivity } from "./account-access";

export type CurrentProfile = {
  user_id: string;
  login_id: string;
  name: string;
  nickname: string | null;
  role: "pending" | "guest" | "member" | "staff" | "admin";
  account_status: "active" | "restricted" | "suspended" | "withdrawn";
  approval_status: "pending" | "approved" | "rejected" | "cancelled";
  staff_position: "staff" | "vice_president" | "president" | null;
  profile_image_url: string | null;
  withdrawal_pending?: boolean;
  is_pacer?: boolean;
  service_blocked?: Partial<Record<ServiceFeature,boolean>>;
};

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("user_id,login_id,name,nickname,role,account_status,approval_status,staff_position,profile_image_url,is_pacer")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getCurrentProfile failed:", error);
    return null;
  }
  if (!data) return null;
  const { data: withdrawal, error: withdrawalError } = await admin.from("withdrawal_requests").select("request_id").eq("user_id", user.id).eq("status", "pending").maybeSingle();
  if (withdrawalError) return null;
  const {data:service,error:serviceError}=await admin.from("system_settings").select("setting_value").eq("setting_key","maintenance").maybeSingle();
  const config=parseMaintenanceSetting(service?.setting_value??{status:"normal"});
  if(serviceError||!config)return null;
  return { ...data, service_blocked:config.status==="restricted"?config.blocked:{}, withdrawal_pending: Boolean(withdrawal) } as CurrentProfile;
}

export function publicName(profile: Pick<CurrentProfile, "nickname" | "login_id">) {
  return profile.nickname?.trim() || profile.login_id;
}

export function canManageStaff(profile: CurrentProfile | null) {
  return isStaffOrAdmin(profile) && (profile?.role === "admin" ||
    (profile?.role === "staff" && ["president", "vice_president"].includes(profile.staff_position ?? "")));
}

export function isStaffOrAdmin(profile: CurrentProfile | null) {
  return canStartActivity(profile) &&
    Boolean(profile) &&
    (profile!.role === "staff" || profile!.role === "admin");
}
