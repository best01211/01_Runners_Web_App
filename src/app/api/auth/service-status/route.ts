import {withProfileModeColumns} from "@/lib/auth/profile-schema";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAccessDuringService, serviceFeatureBlocks, parseMaintenanceSetting } from "@/lib/service-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const { data: { user }, error } = await (await createSupabaseServerClient()).auth.getUser();
  if (error || !user) return json({ destination: "/login" }, 401);
  const admin = createSupabaseAdminClient();
  const [profileResult, settingResult, withdrawalResult] = await Promise.all([
    withProfileModeColumns(async includeModes=>includeModes?await admin.from("profiles").select("name,nickname,role,is_pacer,account_status,approval_status,staff_position,admin_account,admin_mode_normal").eq("user_id", user.id).maybeSingle():await admin.from("profiles").select("name,nickname,role,is_pacer,account_status,approval_status,staff_position").eq("user_id", user.id).maybeSingle()),
    admin.from("system_settings").select("setting_value").eq("setting_key", "maintenance").maybeSingle(),
    admin.from("withdrawal_requests").select("request_id").eq("user_id", user.id).eq("status", "pending").maybeSingle(),
  ]);
  if (profileResult.error || settingResult.error || withdrawalResult.error) return json({ error: "STATUS_CHECK_FAILED" }, 503);
  const profile = profileResult.data;
  if (!profile) return json({ destination: "/pending" });
  if (["suspended", "withdrawn"].includes(profile.account_status) || withdrawalResult.data) return json({ destination: "/account-status" });
  if (profile.approval_status !== "approved" || profile.role === "pending") return json({ destination: "/pending" });
  const setting = parseMaintenanceSetting(settingResult.data?.setting_value ?? { status: "normal" });
  if (!setting) return json({ error: "SERVICE_CONFIG_ERROR" }, 503);
  return json({ profile, blockedFeatures:serviceFeatureBlocks(setting,profile), destination: canAccessDuringService(setting, profile) ? null : "/maintenance" });
}
