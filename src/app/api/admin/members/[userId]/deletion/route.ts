import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UUID } from "@/lib/regular-run-templates";
import { readJsonObject } from "@/lib/request-json";
import { type DeletionJob } from "@/lib/member-deletion";
import { finishMemberDeletion } from "@/lib/member-deletion-runner";
type Context = { params: Promise<{ userId: string }> };
function rpcError(message: string) {
  if (message.includes("CONFIRMATION_MISMATCH")) return fail("CONFIRMATION_MISMATCH", "삭제할 회원의 아이디를 정확히 입력해주세요.", 400);
  if (message.includes("SELF_DELETE") || message.includes("ADMIN_DELETE_PROTECTED")) return fail("PROTECTED_MEMBER", "본인과 관리자 계정은 삭제할 수 없습니다.", 403);
  if (message.includes("FORBIDDEN")) return fail("FORBIDDEN", "활성 관리자만 삭제할 수 있습니다.", 403);
  if (message.includes("MEMBER_NOT_FOUND")) return fail("NOT_FOUND", "회원을 찾을 수 없습니다.", 404);
  return fail("DATABASE_DELETE_FAILED", "DB 연결 기록 정리 결과를 확인하지 못했습니다. 011 SQL 적용 상태와 서버 로그, 관리자 화면의 삭제 상태를 확인해주세요.", 409);
}
export async function GET(_request: Request, { params }: Context) {
  const actor = await getCurrentProfile();
  if (actor?.role !== "admin" || !isStaffOrAdmin(actor)) return fail("FORBIDDEN", "관리자 권한이 필요합니다.", 403);
  const { userId } = await params;
  if (!UUID.test(userId)) return fail("INVALID_ID", "회원 정보를 확인해주세요.");
  const { data, error } = await createSupabaseAdminClient().rpc("inspect_member_deletion", { actor_user_id: actor.user_id, target_user_id: userId });
  if (error) { console.error("Member deletion preview failed", error.code, error.message); return rpcError(error.message); }
  return ok({ preview: data });
}
export async function DELETE(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  const actor = await getCurrentProfile();
  if (actor?.role !== "admin" || !isStaffOrAdmin(actor)) return fail("FORBIDDEN", "관리자 권한이 필요합니다.", 403);
  const { userId } = await params;
  const body = await readJsonObject(request);
  if (!UUID.test(userId) || typeof body?.confirmation !== "string" || !body.confirmation.trim()) return fail("INVALID_CONFIRMATION", "삭제할 회원의 아이디를 입력해주세요.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("prepare_member_deletion", { actor_user_id: actor.user_id, target_user_id: userId, confirmation_login_id: body.confirmation.trim() });
  if (error) { console.error("Member deletion preparation failed", error.code, error.message); return rpcError(error.message); }
  const job = data as DeletionJob;
  if (job.status === "completed") return ok({ deleted: true });
  const retry = (code: string, message: string) => fail(code, `${message} 관리자 화면의 ‘삭제 계속하기’로 재시도해주세요.`, 503, { retryable: true });
  const result = await finishMemberDeletion(job, {
    removeFiles: async (bucket, paths) => !(await admin.storage.from(bucket).remove(paths)).error,
    // Conditional updates prevent concurrent retries from reopening a completed job.
    markStorageCleaned: async () => !(await admin.from("member_deletion_jobs").update({ status: "storage_cleaned" }).eq("job_id", job.job_id).eq("status", "database_cleaned")).error,
    deleteAuth: async () => {
      const { error: authError } = await admin.auth.admin.deleteUser(userId);
      if (!authError || authError.status === 404 || authError.code === "user_not_found") return true;
      console.error("Member Auth deletion failed", authError.code, authError.message); return false;
    },
    markCompleted: async () => !(await admin.from("member_deletion_jobs").update({ status: "completed", completed_at: new Date().toISOString(), confirmation_login_id: null, storage_files: [] }).eq("job_id", job.job_id).neq("status", "completed")).error,
  });
  if (result === "completed") return ok({ deleted: true });
  const messages = {
    storage: "DB 정보는 삭제됐지만 사진 삭제에 실패했습니다.", storage_state: "사진 정리 상태를 저장하지 못했습니다.",
    auth: "DB 정보는 삭제됐지만 인증 계정 삭제에 실패했습니다.", finalize: "계정은 삭제됐지만 완료 상태 저장에 실패했습니다.", connection: "삭제 중 연결이 끊겼습니다.",
  };
  return retry(`DELETE_${result.toUpperCase()}_FAILED`, messages[result]);
}
