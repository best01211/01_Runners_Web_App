import { fail, ok } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
type Context = { params: Promise<{ requestId: string }> };
export async function PATCH(request: Request, { params }: Context) {
 if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
 let body;
 try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
 if (!["approve", "reject"].includes(body?.decision)) return fail("INVALID_DECISION", "처리 방법이 올바르지 않습니다.");
 const { requestId } = await params, client = await createSupabaseServerClient();
 const { data: userId, error } = await client.rpc("review_withdrawal", { target_request_id: requestId, decision: body.decision });
 if (error) return fail("REVIEW_FAILED", "탈퇴 처리에 실패했습니다. 권한·신청 상태·DB 설정을 확인해주세요.", 409);
 if (body.decision === "reject") return ok({ rejected: true });
 const admin = createSupabaseAdminClient();
 const { data: identity, error: lookupError } = await admin.auth.admin.getUserById(userId);
 const missing = lookupError?.code === "user_not_found" || lookupError?.status === 404;
 if (lookupError && !missing) return fail("AUTH_LOOKUP_FAILED", "인증 계정 확인에 실패했습니다. 같은 신청의 승인을 다시 실행해주세요.", 503);
 // Preserve the anonymous profile ID and its historical foreign-key references.
 const { error: deleteError } = missing || identity.user?.deleted_at ? { error: null } : await admin.auth.admin.deleteUser(userId, true);
 if (deleteError && deleteError.code !== "user_not_found" && deleteError.status !== 404) return fail("AUTH_DELETE_FAILED", "익명화는 완료했지만 인증 계정 삭제에 실패했습니다. 같은 신청의 승인을 다시 실행해주세요.", 503);
 const { error: saveError } = await admin.from("withdrawal_requests").update({ auth_deleted_at: new Date().toISOString() }).eq("request_id", requestId);
 if (saveError) return fail("FINALIZE_FAILED", "인증 계정은 삭제했지만 완료 기록 저장에 실패했습니다. 다시 승인해주세요.", 503);
 return ok({ approved: true });
}
