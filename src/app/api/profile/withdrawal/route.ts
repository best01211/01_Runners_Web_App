import { fail, ok } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
 if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
 let body;
 try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
 const reason = String(body?.reason ?? "").trim();
 if (reason.length > 2000) return fail("INVALID_REASON", "탈퇴 사유는 2000자 이하여야 합니다.");
 const client = await createSupabaseServerClient();
 const { data, error } = await client.rpc("request_withdrawal", { reason_text: reason });
 return error ? fail("REQUEST_FAILED", "탈퇴 신청에 실패했습니다. 계정 상태 또는 DB 설정을 확인해주세요.", 409) : ok({ request: data }, 201);
}
