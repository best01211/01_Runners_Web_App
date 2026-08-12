import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const { data, error } = await createSupabaseAdminClient().from("seasons").select("*").order("starts_on", { ascending: false });
  return error ? fail("DATABASE_ERROR", "시즌을 불러오지 못했습니다.", 500) : ok({ seasons: data });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return fail("FORBIDDEN", "관리자 권한이 필요합니다.", 403);
  const body = await request.json();
  const startsOn = String(body.startsOn ?? "");
  const endsOn = String(body.endsOn ?? "");
  if (!body.name || !startsOn || !endsOn || startsOn > endsOn) return fail("INVALID_PERIOD", "시즌 기간을 확인해주세요.");
  const admin = createSupabaseAdminClient();
  if (body.isDefault) await admin.from("seasons").update({ is_default: false }).eq("is_default", true);
  const { data, error } = await admin.from("seasons").insert({ name: String(body.name).trim(), starts_on: startsOn, ends_on: endsOn, status: body.status ?? "scheduled", is_public: body.isPublic !== false, is_default: body.isDefault === true, created_by: profile.user_id }).select().single();
  return error ? fail("CREATE_FAILED", "시즌 생성에 실패했습니다.", 500) : ok({ season: data }, 201);
}
