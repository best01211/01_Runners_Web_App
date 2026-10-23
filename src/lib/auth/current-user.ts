import {withProfileModeColumns} from "@/lib/auth/profile-schema";
import {headers} from "next/headers";
import {PAGE_CONTEXT_HEADER,decodePageContext} from "./page-context";
import { cache } from "react";
import { measure } from "@/lib/performance";
import {parseMaintenanceSetting,serviceFeatureBlocks,type ServiceFeature} from "@/lib/service-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canStartActivity } from "./account-access";
export { canUseService, canStartActivity, hasAdminAuthority, canAdminister } from "./account-access";

export type CurrentProfile = {
  user_id: string;
  login_id: string;
  name: string;
  nickname: string | null;
  role: "pending" | "guest" | "member" | "staff" | "admin";
  account_status: "active" | "restricted" | "suspended" | "withdrawn";
  approval_status: "pending" | "approved" | "rejected" | "cancelled";
  staff_position: "staff" | "vice_president" | "president" | null;
  admin_account?:boolean;
  admin_mode_normal?:boolean;
  profile_image_url: string | null;
  withdrawal_pending?: boolean;
  is_pacer?: boolean;
  service_blocked?: Partial<Record<ServiceFeature,boolean>>;
};

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  return measure("auth.current-user", () => supabase.auth.getUser());
});

// Request-scoped React memoization; no cross-request identity or policy cache.
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => measure("auth.profile", async () => {
  const { data: { user } } = await getCurrentUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const [profileResult, withdrawalResult, serviceResult] = await Promise.all([
    withProfileModeColumns(async includeModes=>includeModes?await admin.from("profiles").select("user_id,login_id,name,nickname,role,account_status,approval_status,staff_position,profile_image_url,is_pacer,admin_account,admin_mode_normal").eq("user_id", user.id).maybeSingle():await admin.from("profiles").select("user_id,login_id,name,nickname,role,account_status,approval_status,staff_position,profile_image_url,is_pacer").eq("user_id", user.id).maybeSingle()),
    admin.from("withdrawal_requests").select("request_id").eq("user_id", user.id).eq("status", "pending").maybeSingle(),
    admin.from("system_settings").select("setting_value").eq("setting_key","maintenance").maybeSingle(),
  ]);
  const { data, error } = profileResult;
  const { data: withdrawal, error: withdrawalError } = withdrawalResult;
  const { data: service, error: serviceError } = serviceResult;

  if (error) {
    console.error("getCurrentProfile failed:", error);
    return null;
  }
  if (!data) return null;
  if (withdrawalError) return null;
  const config=parseMaintenanceSetting(service?.setting_value??{status:"normal"});
  if(serviceError||!config)return null;
  return { ...data, service_blocked:serviceFeatureBlocks(config,{...data,withdrawal_pending:Boolean(withdrawal)}), withdrawal_pending: Boolean(withdrawal) } as CurrentProfile;
}));

// Page rendering only. API handlers deliberately continue using getCurrentProfile.
export const getCurrentPageProfile=cache(async():Promise<CurrentProfile|null>=>{
 const requestHeaders=await headers();
 const verified=decodePageContext(requestHeaders.get(PAGE_CONTEXT_HEADER),requestHeaders.get("cookie")??"");
 if(verified)return verified;
 return getCurrentProfile();
});

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
