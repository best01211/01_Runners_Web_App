import { fail, ok } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {getCurrentProfile,isStaffOrAdmin} from '@/lib/auth/current-user';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {memberFields,uuidPattern} from '@/lib/member-directory';
import {memberAttendance} from '@/lib/member-attendance';
type Context = { params: Promise<{ userId: string }> };
export async function GET(request:Request,{params}:Context){
 const actor=await getCurrentProfile();if(!actor||!isStaffOrAdmin(actor))return fail('FORBIDDEN','회원 조회 권한이 없습니다.',403);
 const {userId}=await params;if(!uuidPattern.test(userId))return fail('INVALID_ID','회원을 확인해주세요.');
 let query=createSupabaseAdminClient().from('profiles').select(memberFields).eq('user_id',userId);
 if(actor.role!=='admin')query=query.neq('role','admin');
 const {data:member,error}=await query.maybeSingle();
 if(error)return fail('LOAD_FAILED','회원 정보를 불러오지 못했습니다.',500);
 if(!member)return fail('NOT_FOUND','조회할 수 없는 회원입니다.',404);
 if(new URL(request.url).searchParams.get('view')==='settings')return ok({member});
 try {return ok({member,attendances:await memberAttendance([userId])});}
 catch{return fail('LOAD_FAILED','출석 정보를 불러오지 못했습니다.',500);}
}
export async function PATCH(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  let body;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "입력값을 확인해주세요.");
  const payload: Record<string, unknown> = {};
  if (body.role !== undefined) payload.role = body.role;
  if (body.staffPosition !== undefined) payload.staff_position = body.staffPosition;
  if (body.accountStatus !== undefined) payload.account_status = body.accountStatus;
  if (typeof body.isPacer === "boolean") payload.is_pacer = body.isPacer;
  if (typeof body.rankingExcluded === "boolean") payload.ranking_excluded = body.rankingExcluded;
  const { userId } = await params;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("manage_member", { target_user_id: userId, payload });
  if (!error) return ok({ member: data });
  const messages: Record<string, string> = {
    FORBIDDEN: "회원 변경 권한이 없습니다.", SELF_CHANGE: "본인의 권한과 상태는 변경할 수 없습니다.",
    WITHDRAWAL_PENDING: "탈퇴 신청을 먼저 승인하거나 반려해주세요.",
    INVALID_MEMBER_STATE: "탈퇴 완료 또는 미승인 계정은 변경할 수 없습니다.",
    ADMIN_ACCOUNT_PROTECTED: "관리자 계정 변경과 관리자 지정은 관리자만 가능합니다.",
    ADMIN_ROLE_PROTECTED: "관리자 등급은 다른 등급으로 변경할 수 없습니다.",
    INVALID_STATUS: "탈퇴는 전용 탈퇴 승인 메뉴에서 처리해주세요.",
  };
  const key = Object.keys(messages).find(key => error.message.includes(key));
  return fail(key ?? "UPDATE_FAILED", key ? messages[key] : "회원 변경에 실패했습니다. 입력값과 DB 설정을 확인해주세요.", key === "FORBIDDEN" ? 403 : 409);
}
