import { canUseService } from "@/lib/auth/account-access";
import { isAttendanceCode } from "@/lib/attendance-code";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
type Context = { params: Promise<{ scheduleId: string }> };
export async function GET(_: Request, { params }: Context) {
 const p = await getCurrentProfile();
 if (!p || !canUseService(p)) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
 const { scheduleId } = await params, admin = createSupabaseAdminClient();
 const {error:closeError}=await admin.rpc("close_due_regular_attendance");
 if(closeError)return fail("SETUP_REQUIRED","자동 출석 종료 SQL(021)을 적용해주세요.",503);
 const { data: schedule, error: scheduleError } = await admin.from("schedules").select("*").eq("schedule_id", scheduleId).is("deleted_at", null).maybeSingle();
 if (scheduleError) return fail("DATABASE_ERROR", "일정 조회에 실패했습니다.", 500);
 if (!schedule) return fail("NOT_FOUND", "일정을 찾을 수 없습니다.", 404);
 const manage = isStaffOrAdmin(p) || (p.account_status === "active" && p.role === "member" && schedule.schedule_type === "flash" && schedule.creator_id === p.user_id);
 const query = manage ? admin.from("attendances").select("*,profiles:user_id(name)").eq("schedule_id", scheduleId) : admin.from("attendances").select("*").eq("schedule_id", scheduleId).eq("user_id", p.user_id);
 const { data, error } = await query;
 let attendance:unknown=data;
 if(manage){
  const {data:participants,error:participantError}=await admin.from("schedule_participations").select("user_id,pace_group_id,profiles:user_id(name,role)").eq("schedule_id",scheduleId).in("status",["registered","completed"]);
  if(participantError)return fail("DATABASE_ERROR","참가 명단을 불러오지 못했습니다.",500);
  attendance=(participants??[]).filter(row=>p.role==='admin'||(Array.isArray(row.profiles)?row.profiles[0]:row.profiles)?.role!=='admin').map(row=>({...row,profiles:Array.isArray(row.profiles)?row.profiles[0]:row.profiles,status:data?.find(item=>item.user_id===row.user_id)?.status??'not_checked'}));
 }
 return error ? fail("DATABASE_ERROR", "출석 정보를 불러오지 못했습니다.", 500) : ok({ attendance, attendanceOpen: Boolean(schedule.attendance_opened_at && !schedule.attendance_closed_at), attendanceClosed: Boolean(schedule.attendance_closed_at), attendanceCode: manage ? schedule.attendance_code : undefined, canManage: manage });
}
async function write(request: Request, context: Context, method: "POST" | "PATCH") {
 if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
 const profile = await getCurrentProfile();
 if (!profile || !canUseService(profile)) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
 let body;
 try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
 if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "입력값을 확인해주세요.");
 const action = method === "PATCH" ? (body.action === "close" ? "close" : "manual") : body.action;
 if (!(method === "POST" ? ["open", "check"] : ["close", "manual"]).includes(action)) return fail("INVALID_ACTION", "올바르지 않은 요청입니다.");
 if (action === "check" && !isAttendanceCode(body.code)) return fail("INVALID_CODE", "출석번호는 숫자 4자리로 입력해주세요.");
 if (profile.account_status === "restricted" && action !== "check") return fail("FORBIDDEN", "제한 상태에서는 기존 참가의 출석 인증만 할 수 있습니다.", 403);
 const { scheduleId } = await context.params;
 const {error:closeError}=await createSupabaseAdminClient().rpc("close_due_regular_attendance");
 if(closeError)return fail("SETUP_REQUIRED","자동 출석 종료 SQL(021)을 적용해주세요.",503);
 const client = await createSupabaseServerClient();
 const { data, error } = await client.rpc("write_attendance", { target_schedule_id: scheduleId, payload: { ...body, action } });
 if (!error) return ok(data);
 console.error("Attendance RPC failed", { scheduleId, action, code: error.code, message: error.message, details: error.details, hint: error.hint });
 const messages: Record<string, string> = { FORBIDDEN: "출석 처리 권한이 없습니다.", SCHEDULE_UNAVAILABLE: "취소되었거나 사용할 수 없는 일정입니다.", ALREADY_OPENED: "이미 출석을 시작했습니다.", ALREADY_CHECKED: "이미 처리된 출석입니다. 변경은 운영진에게 요청해주세요.", ATTENDANCE_CLOSED: "출석 입력 시간이 아닙니다.", INVALID_CODE: "출석번호가 일치하지 않습니다.", NOT_PARTICIPANT: "참가 신청자만 출석할 수 있습니다.", INVALID_STATUS: "출석 상태가 올바르지 않습니다." };
 const key = Object.keys(messages).find(key => error.message.includes(key));
 return fail(key ?? "DATABASE_ERROR", key ? messages[key] : "출석 저장에 실패했습니다. 아래 오류 정보를 확인해주세요.", key === "FORBIDDEN" ? 403 : key ? 409 : 500, !key && isStaffOrAdmin(profile) ? { databaseCode: error.code, databaseMessage: error.message } : undefined);
}
export async function POST(request: Request, context: Context) { return write(request, context, "POST"); }
export async function PATCH(request: Request, context: Context) { return write(request, context, "PATCH"); }
