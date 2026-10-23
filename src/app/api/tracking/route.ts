import {canAdminister} from "@/lib/auth/account-access";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateRaceWrite } from "@/lib/race-tracking/validation";
import { MAX_REGISTRATION_BYTES,validateRegistration } from "@/lib/race-tracking/registration";
export async function POST(request: Request) {
 if(request.headers.get("origin")!==new URL(request.url).origin) return fail("FORBIDDEN","허용되지 않은 요청입니다.",403);
 const p=await getCurrentProfile();
 if(!p) return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
 if(!canAdminister(p)||p.account_status!=="active"||p.approval_status!=="approved") return fail("FORBIDDEN","관리자만 대회를 등록할 수 있습니다.",403);
 if(p.service_blocked?.liveTracking)return fail("FORBIDDEN","현재 추적 기능을 이용할 수 없습니다.",403);
 let payload,bulk=false;
 try {
  if(Number(request.headers.get("content-length"))>MAX_REGISTRATION_BYTES)return fail("TOO_LARGE","코스 전체 전송 크기는 3.5MB 이하여야 합니다.",413);
  const raw=await request.text(); if(new TextEncoder().encode(raw).byteLength>MAX_REGISTRATION_BYTES)return fail("TOO_LARGE","코스 전체 전송 크기는 3.5MB 이하여야 합니다.",413);
  const b=JSON.parse(raw);
  if(b?.action==="event"){payload=validateRegistration(b);bulk=true;}
  else {
  const course=validateRaceWrite(b);
  if(course.action!=="course"||typeof b.location!=="string"||b.location.trim().length>200)throw new Error("대회 정보를 확인해주세요.");
  payload={...course,courseName:course.courseName??"기본 코스",location:b.location.trim()};
  }
 }catch(e){return fail("INVALID_INPUT",e instanceof Error?e.message:"입력값을 확인해주세요.");}
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc(bulk?"create_tracking_event":"create_tracking_race",{payload});
 if(error)return fail("CREATE_FAILED",["PGRST202","42P01"].includes(error.code)?"추적 전용 DB 설정이 필요합니다. 029 마이그레이션까지 적용해주세요.":error.message==="DUPLICATE_COURSE"?"이미 등록된 종목 이름입니다.":error.message==="COURSE_LIMIT"?"대회당 최대 20종목까지 등록할 수 있습니다.":"대회 등록에 실패했습니다. 입력값과 관리자 권한을 확인해주세요.",409);
 return ok({raceId:data},201);
}
