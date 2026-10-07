import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
type Context = { params: Promise<{ scheduleId: string }> };
export async function GET(_: Request, { params }: Context) {
 const p = await getCurrentProfile();
 if (!p) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
 const { scheduleId } = await params, admin = createSupabaseAdminClient();
 const { data: schedule, error: scheduleError } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).is("deleted_at", null).maybeSingle();
 if (scheduleError) return fail("DATABASE_ERROR", "일정 조회에 실패했습니다.", 500);
 if (!schedule) return fail("NOT_FOUND", "일정을 찾을 수 없습니다.", 404);
 const manage = isStaffOrAdmin(p) || (p.role === "member" && schedule.schedule_type === "flash" && schedule.creator_id === p.user_id);
 const query = manage ? admin.from("attendances").select("*,profiles:user_id(name)").eq("schedule_id", scheduleId) : admin.from("attendances").select("*").eq("schedule_id", scheduleId).eq("user_id", p.user_id);
 const { data, error } = await query;
 return error ? fail("DATABASE_ERROR", "출석 정보를 불러오지 못했습니다.", 500) : ok({ attendance: data, attendanceOpen: Boolean(schedule.attendance_opened_at && !schedule.attendance_closed_at), attendanceClosed: Boolean(schedule.attendance_closed_at), attendanceCode: manage ? schedule.attendance_code : undefined, canManage: manage });
}
async function write(request: Request, context: Context, method: "POST" | "PATCH") {
 if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
 let body;
 try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
 if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "입력값을 확인해주세요.");
 const action = method === "PATCH" ? (body.action === "close" ? "close" : "manual") : body.action;
 if (!(method === "POST" ? ["open", "check"] : ["close", "manual"]).includes(action)) return fail("INVALID_ACTION", "올바르지 않은 요청입니다.");
 const { scheduleId } = await context.params;
 const client = await createSupabaseServerClient();
 const { data, error } = await client.rpc("write_attendance", { target_schedule_id: scheduleId, payload: { ...body, action } });
 if (!error) return ok(data);
 const messages: Record<string, string> = { FORBIDDEN: "출석 처리 권한이 없습니다.", SCHEDULE_UNAVAILABLE: "취소되었거나 사용할 수 없는 일정입니다.", ALREADY_OPENED: "이미 출석을 시작했습니다.", ALREADY_CHECKED: "이미 처리된 출석입니다. 변경은 운영진에게 요청해주세요.", ATTENDANCE_CLOSED: "출석 입력 시간이 아닙니다.", INVALID_CODE: "출석번호가 일치하지 않습니다.", NOT_PARTICIPANT: "참가 신청자만 출석할 수 있습니다.", INVALID_STATUS: "출석 상태가 올바르지 않습니다." };
 const key = Object.keys(messages).find(key => error.message.includes(key));
 return fail(key ?? "DATABASE_ERROR", key ? messages[key] : "출석 저장에 실패했습니다. DB 설정을 확인해주세요.", key === "FORBIDDEN" ? 403 : key ? 409 : 500);
}
export async function POST(request: Request, context: Context) { return write(request, context, "POST"); }
export async function PATCH(request: Request, context: Context) { return write(request, context, "PATCH"); }
