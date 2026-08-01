import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await getCurrentProfile();
  if (!actor) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  if (!isStaffOrAdmin(actor)) return fail("FORBIDDEN", "운영 권한이 필요합니다.", 403);

  const { userId } = await params;
  let body: { decision?: unknown; reason?: unknown; allowReapplication?: unknown };
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400); }

  const decision = String(body.decision ?? "").trim().toLowerCase();
  const reason = String(body.reason ?? "").trim();
  if (!["approve", "reject"].includes(decision)) return fail("INVALID_DECISION", "decision은 approve 또는 reject여야 합니다.", 400);
  if (decision === "reject" && reason.length < 2) return fail("REJECTION_REASON_REQUIRED", "거절 사유를 입력해 주세요.", 400);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("review_pending_member", {
    target_user_id: userId,
    decision,
    reason_text: reason || null,
    allow_reapplication: body.allowReapplication !== false,
  });
  if (error) {
    console.error(error);
    return fail("APPROVAL_FAILED", "회원 승인 처리에 실패했습니다.", 500, { message: error.message });
  }
  return ok({ member: data });
}
