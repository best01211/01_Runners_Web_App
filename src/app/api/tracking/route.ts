import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateRaceWrite } from "@/lib/race-tracking/validation";
export async function POST(request: Request) {
 if(request.headers.get("origin")!==new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
 const p=await getCurrentProfile();
 if(!p) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
 if(p.role!=="admin"||p.account_status!=="active"||p.approval_status!=="approved") return fail("FORBIDDEN","관리자만 대회를 등록할 수 있습니다.",403);
 let payload;
 try {
  const raw=await request.text(); if(raw.length>2000000)return fail("TOO_LARGE","요청 크기가 너무 큽니다.",413);
  const b=JSON.parse(raw),course=validateRaceWrite(b);
  if(course.action!=="course"||typeof b.location!=="string"||b.location.trim().length>200)throw new Error("대회 정보를 확인해주세요.");
  payload={...course,location:b.location.trim()};
 }catch(e){return fail("INVALID_INPUT",e instanceof Error?e.message:"입력값을 확인해주세요.");}
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc("create_tracking_race",{payload});
 if(error)return fail("CREATE_FAILED",["PGRST202","42P01"].includes(error.code)?"추적 전용 DB 설정이 필요합니다. 007 마이그레이션을 적용해주세요.":"대회 등록에 실패했습니다. 입력값과 관리자 권한을 확인해주세요.",409);
 return ok({raceId:data},201);
}
