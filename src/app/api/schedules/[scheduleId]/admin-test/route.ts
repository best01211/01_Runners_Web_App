import {fail,ok} from "@/lib/api-response";
import {getCurrentProfile,canStartActivity} from "@/lib/auth/current-user";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {readJsonObject} from "@/lib/request-json";
type Context={params:Promise<{scheduleId:string}>};
export async function POST(request:Request,{params}:Context){
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
 const profile=await getCurrentProfile();if(profile?.role!=="admin"||!canStartActivity(profile))return fail("FORBIDDEN","관리자만 사용할 수 있습니다.",403);
 const payload=await readJsonObject(request);if(!payload)return fail("INVALID_JSON","입력값을 확인해주세요.");
 const {scheduleId}=await params;const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc("write_admin_schedule_test",{target_schedule:scheduleId,payload});
 if(error){const messages:Record<string,string>={INVALID_CODE:"출석번호가 일치하지 않습니다.",SCHEDULE_NOT_STARTED:"일정 시작 시각부터 출석할 수 있습니다.", ATTENDANCE_CLOSED:"출석 입력 시간이 아닙니다.",PARTICIPATION_LOCKED:"현재 참가를 취소할 수 없습니다.",SCHEDULE_NOT_OPEN:"신청 가능한 일정이 아닙니다.",REGISTRATION_CLOSED:"신청이 마감되었습니다.",REGISTRATION_NOT_STARTED:"신청 시작 전입니다.",SERVICE_FEATURE_BLOCKED:"현재 참가 기능이 제한되었습니다."};return fail("TEST_FAILED",messages[Object.keys(messages).find(key=>error.message===key||error.message.startsWith(key+":"))??""]??"기능 확인에 실패했습니다. 일정 상태와 DB 설정을 확인해주세요.",409);}
 return ok({participation:data});
}
