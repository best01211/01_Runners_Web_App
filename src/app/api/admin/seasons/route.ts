import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("FORBIDDEN", "이용 권한이 필요합니다.", 403);
  let query = createSupabaseAdminClient().from("seasons").select("*").order("starts_on", { ascending: false });
  if (!isStaffOrAdmin(profile)) query = query.eq("is_public", true).neq("status", "hidden");
  const { data, error } = await query;
  return error ? fail("DATABASE_ERROR", "시즌을 불러오지 못했습니다.", 500) : ok({ seasons: data });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  let body;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "입력값을 확인해주세요.");
  const starts = String(body.startsOn ?? ""), ends = String(body.endsOn ?? "");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!String(body.name ?? "").trim() || !validDate(starts) || !validDate(ends) || starts > ends || !["scheduled", "active", "closed", "hidden"].includes(body.status ?? "scheduled")) return fail("INVALID_PERIOD", "시즌 이름과 기간·상태를 확인해주세요.");
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("create_season", { payload: body });
  return error ? fail("CREATE_FAILED", "시즌 생성에 실패했습니다. 기본 시즌은 공개 상태여야 합니다.", 409) : ok({ season: data }, 201);
}
