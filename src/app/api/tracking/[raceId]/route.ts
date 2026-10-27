import {loadTrackingSnapshot} from "@/lib/tracking-snapshot-server";
import {canAdminister,canRegisterTrackingEntries} from "@/lib/auth/account-access";
import {canUseService} from "@/lib/auth/account-access";
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUUID, validateRaceWrite } from "@/lib/race-tracking/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ raceId: string }> };
export async function DELETE(request: Request, { params }: Context) {
 if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
 const profile = await getCurrentProfile();
 if (!profile) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
 if (!canAdminister(profile)) return fail("FORBIDDEN", "관리자만 추적 이벤트를 삭제할 수 있습니다.", 403);
 if(profile.service_blocked?.liveTracking)return fail("FORBIDDEN","현재 추적 기능을 이용할 수 없습니다.",403);
 const { raceId } = await params;
 if (!isUUID(raceId)) return fail("NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
 const admin = createSupabaseAdminClient();
 if (profile.role !== "admin") {
  const {data: race, error: raceError} = await admin.from("tracking_races").select("parent_race_id").eq("race_id", raceId).maybeSingle();
  if (raceError) return fail("DATABASE_ERROR", "대회 정보를 불러오지 못했습니다.", 503);
  if (!race) return fail("NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
  if (!race.parent_race_id) return fail("FORBIDDEN", "관리자만 대회 전체를 보관할 수 있습니다.", 403);
 }
 // Keep related entries/checkpoints intact, and use the existing visibility policy.
 const { data, error } = await admin.from("tracking_races").update({status:"archived"}).or(`race_id.eq.${raceId},parent_race_id.eq.${raceId}`).select("race_id");
 if (error) return fail("DELETE_FAILED", "이벤트를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
 if (!data?.length) return fail("NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
 return ok({deleted:true});
}
async function context(raceId: string) {
 const profile = await getCurrentProfile();
 if (!profile) return { error: fail("UNAUTHORIZED", "로그인이 필요합니다.", 401) };
 if (!canUseService(profile)) return { error: fail("FORBIDDEN", "승인된 활성 회원만 이용할 수 있습니다.", 403) };
 if(profile.service_blocked?.liveTracking)return {error:fail("FORBIDDEN","현재 추적 기능을 이용할 수 없습니다.",403)};
 if (!isUUID(raceId)) return { error: fail("NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404) };
 const admin = createSupabaseAdminClient();
 const { data: schedule, error } = await admin.from("tracking_races").select("name,status").eq("race_id", raceId).maybeSingle();
 if (error) return { error: fail("DATABASE_ERROR", "이벤트를 불러오지 못했습니다.", 503) };
 if (!schedule || schedule.status !== "active") return { error: fail("NOT_FOUND", "진행 가능한 이벤트를 찾을 수 없습니다.", 404) };
 return { profile, admin, schedule, canManage: canAdminister(profile) };
}
function databaseFailure(code: string) {
 if (["42P01","PGRST205","PGRST202"].includes(code)) return fail("SETUP_REQUIRED", "추적 전용 DB 설정이 필요합니다. 관리자에게 알려주세요.", 503);
 return fail("DATABASE_ERROR", "추적 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
}
export async function GET(_:Request,{params}:Context){
 const profile=await getCurrentProfile();if(!profile||!canUseService(profile))return fail("UNAUTHORIZED","로그인이 필요합니다.",401);
 const {raceId}=await params;if(!isUUID(raceId))return fail("NOT_FOUND","이벤트를 찾을 수 없습니다.",404);
 try{const response=ok(await loadTrackingSnapshot(raceId,profile));response.headers.set("Cache-Control","private, no-store");return response;}
 catch(error){const code=error instanceof Error?error.message:"DATABASE_ERROR";return fail(code,"추적 정보를 불러오지 못했습니다.",code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:503);}
}

const errors: Record<string, string> = {
 DUPLICATE_COURSE:"이미 등록된 종목 이름입니다.", INVALID_COURSE:"종목 이름과 코스 정보를 확인해주세요.",
 GROUP_REQUIRED:"선택한 그룹이 해당 코스의 그룹인지 확인해주세요. 그룹 미지정으로도 등록할 수 있습니다.", EVENT_ENTRY_EXISTS:"이미 이 대회의 다른 종목에 등록된 회원입니다.", GROUP_LIMIT:"종목별 그룹은 50개까지 등록할 수 있습니다.",
 RACE_FORBIDDEN: "변경 권한이 없습니다.", RACE_NOT_FOUND: "진행 가능한 이벤트가 아닙니다.",
 COURSE_LOCKED: "선수가 등록된 코스는 변경할 수 없습니다.", COURSE_REQUIRED: "먼저 코스를 등록해주세요.",
 NOT_PARTICIPANT: "승인된 활성 회원만 출전 등록할 수 있습니다.", ENTRY_LOCKED: "계측 기록이 있는 선수 정보는 수정할 수 없습니다. 잘못 등록한 선수는 삭제하거나 코스를 변경해주세요.",
 INVALID_RUNNER_NAME: "선수 이름을 1~50자로 입력해주세요.",
 ENTRY_NOT_FOUND: "선수를 찾을 수 없습니다.", STATUS_LOCKED: "완주·미출발·중도 포기 상태와 계측 기록을 확인해주세요.",
 INVALID_CHECKPOINT: "코스 거리·대회 출발 시각을 확인해주세요. 미래 통과 시각은 입력할 수 없습니다.",
 CHECKPOINT_ORDER: "이미 기록한 거리보다 먼 지점과 늦은 시각을 입력해주세요.",
 CHECKPOINT_PACE: "구간 페이스가 2:00~20:00/km 범위를 벗어납니다. 거리와 시각을 확인해주세요.",
 CHECKPOINT_LIMIT: "선수당 계측 기록은 100개까지 지원합니다.", ENTRY_LIMIT: "현재 대회당 출전 선수는 500명까지 지원합니다.",
};
export async function POST(request: Request, { params }: Context) {
 if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
 const { raceId } = await params, c = await context(raceId);
 if (c.error) return c.error;
 if (Number(request.headers.get("content-length")) > 2000000) return fail("TOO_LARGE", "요청 크기가 너무 큽니다.", 413);
 let write;
 try { const raw = await request.text(); if (raw.length > 2000000) return fail("TOO_LARGE", "요청 크기가 너무 큽니다.", 413); write = validateRaceWrite(JSON.parse(raw)); }
 catch (e) { return fail("INVALID_INPUT", e instanceof Error ? e.message : "입력값을 확인해주세요."); }
 if (["entry","entry-delete","entry-move"].includes(write.action)?!canRegisterTrackingEntries(c.profile):!c.canManage) return fail("FORBIDDEN", "해당 추적 정보를 변경할 권한이 없습니다.", 403);
 // Use the selected member's real name, never a client-supplied name or login ID.
 let payload: typeof write & { runnerName?: string } = write;
 if (write.action === "entry" && !write.runnerName) {
  const { data: member, error: memberError } = await c.admin.from("profiles").select("name").eq("user_id", write.userId!).eq("account_status", "active").eq("approval_status", "approved").maybeSingle();
  if (memberError) return databaseFailure(memberError.code);
  if (!member) return fail("NOT_PARTICIPANT", errors.NOT_PARTICIPANT, 409);
  const runnerName = member.name?.trim();
  if (!runnerName) return fail("INVALID_RUNNER_NAME", errors.INVALID_RUNNER_NAME, 409);
  payload = { ...write, runnerName };
 }
 const client = await createSupabaseServerClient();
 const { error } = await client.rpc("write_tracking_race", { target_race: raceId, payload });
 if (error) {
  if (["42P01","PGRST202","PGRST205"].includes(error.code)) return databaseFailure(error.code);
  if (error.code === "23505") return fail("DUPLICATE", "이미 등록된 배번호·그룹명 또는 계측 지점입니다.", 409);
  const message = errors[error.message];
  return fail("WRITE_FAILED", message ?? "저장하지 못했습니다. 입력값과 DB 설정을 확인해주세요.", message ? 409 : 400);
 }
 return ok({ saved: true });
}
