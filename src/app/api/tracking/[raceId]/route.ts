import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUUID, validateRaceWrite } from "@/lib/race-tracking/validation";
import type { RaceSnapshot } from "@/lib/race-tracking/live-types";
import type { Checkpoint } from "@/lib/race-tracking/types";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ raceId: string }> };
async function context(raceId: string) {
 const profile = await getCurrentProfile();
 if (!profile) return { error: fail("UNAUTHORIZED", "로그인이 필요합니다.", 401) };
 if (profile.account_status !== "active" || profile.approval_status !== "approved" || profile.role === "pending") return { error: fail("FORBIDDEN", "승인된 활성 회원만 이용할 수 있습니다.", 403) };
 if (!isUUID(raceId)) return { error: fail("NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404) };
 const admin = createSupabaseAdminClient();
 const { data: schedule, error } = await admin.from("tracking_races").select("name,status").eq("race_id", raceId).maybeSingle();
 if (error) return { error: fail("DATABASE_ERROR", "이벤트를 불러오지 못했습니다.", 503) };
 if (!schedule || schedule.status !== "active") return { error: fail("NOT_FOUND", "진행 가능한 이벤트를 찾을 수 없습니다.", 404) };
 return { profile, admin, schedule, canManage: profile.role === "admin" };
}
function databaseFailure(code: string) {
 if (["42P01","PGRST205","PGRST202"].includes(code)) return fail("SETUP_REQUIRED", "추적 전용 DB 설정이 필요합니다. 관리자에게 알려주세요.", 503);
 return fail("DATABASE_ERROR", "추적 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
}
export async function GET(_: Request, { params }: Context) {
 const { raceId } = await params, c = await context(raceId);
 if (c.error) return c.error;
 const { data: course, error } = await c.admin.from("tracking_races").select("name,distance_meters,points,start_at").eq("race_id", raceId).maybeSingle();
 if (error) return databaseFailure(error.code);

 const {data:entries,error:entryError}=await c.admin.from("tracking_race_entries").select("entry_id,user_id,bib,target_pace_seconds,status").eq("race_id",raceId).limit(501);
 if(entryError)return databaseFailure(entryError.code);
 if((entries?.length??0)>500)return fail("CAPACITY_LIMIT","대회당 최대 500명을 지원합니다.",409);
 const ids=(entries??[]).map(e=>e.user_id);
 let query=c.admin.from("profiles").select("user_id,nickname,name").eq("account_status","active").eq("approval_status","approved");
 if(!c.canManage)query=query.in("user_id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]);
 const {data:profiles,error:profileError}=await query.limit(500);
 if(profileError)return databaseFailure(profileError.code);
 const eligible=new Map((profiles??[]).map(p=>[p.user_id,p]));
 const visibleEntries=(entries??[]).filter(e=>eligible.has(e.user_id));
 const checkpointMap: Record<string, Checkpoint[]> = {};
 // Each runner has a bounded checkpoint count. Paging avoids Supabase's default row cap.
 if (visibleEntries.length) {
  for (let offset = 0; ; offset += 1000) {
   const { data: records, error: recordError } = await c.admin.from("tracking_checkpoints").select("checkpoint_id,entry_id,name,distance_meters,passed_at,received_at,source").in("entry_id", visibleEntries.map(e => e.entry_id)).order("checkpoint_id").range(offset, offset + 999);
   if (recordError) return databaseFailure(recordError.code);
   for (const r of records ?? []) (checkpointMap[r.entry_id] ??= []).push({ id: r.checkpoint_id, name: r.name, distanceMeters: r.distance_meters, passedAt: r.passed_at, receivedAt: r.received_at, source: "manual" });
   if ((records?.length ?? 0) < 1000) break;
  }
 }
 const snapshot: RaceSnapshot = {
  serverNow: new Date().toISOString(), title: c.schedule.name, currentUserId: c.profile.user_id, canManage: c.canManage, courseLocked: Boolean(entries?.length),
  course: course ? { name: course.name, distanceMeters: course.distance_meters, points: course.points, startAt: course.start_at } : null,
  participants: [...eligible.values()].filter(() => c.canManage).map(p => ({ userId: p.user_id, name: p.nickname?.trim() || p.name })),
  entries: visibleEntries.filter(() => c.canManage).map(e => ({ entryId: e.entry_id, userId: e.user_id, bib: e.bib })),
  runners: visibleEntries.map(e => ({ id: e.entry_id, name: eligible.get(e.user_id)!.nickname?.trim() || eligible.get(e.user_id)!.name, bib: e.bib, startAt: course!.start_at, targetPaceSeconds: e.target_pace_seconds ?? undefined, status: e.status })),
  checkpoints: checkpointMap,
 };
 const response = ok(snapshot); response.headers.set("Cache-Control", "private, no-store"); return response;
}
const errors: Record<string, string> = {
 RACE_FORBIDDEN: "변경 권한이 없습니다.", RACE_NOT_FOUND: "진행 가능한 이벤트가 아닙니다.",
 COURSE_LOCKED: "선수가 등록된 코스는 변경할 수 없습니다.", COURSE_REQUIRED: "먼저 코스를 등록해주세요.",
 NOT_PARTICIPANT: "승인된 활성 회원만 출전 등록할 수 있습니다.", ENTRY_LOCKED: "출발 이후 또는 계측 기록이 있는 선수 정보는 수정할 수 없습니다.",
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
 if (!c.canManage) return fail("FORBIDDEN", "관리자만 추적 정보를 등록할 수 있습니다.", 403);
 const client = await createSupabaseServerClient();
 const { error } = await client.rpc("write_tracking_race", { target_race: raceId, payload: write });
 if (error) {
  if (["42P01","PGRST202","PGRST205"].includes(error.code)) return databaseFailure(error.code);
  if (error.code === "23505") return fail("DUPLICATE", "이미 등록된 배번호 또는 계측 지점입니다.", 409);
  const message = errors[error.message];
  return fail("WRITE_FAILED", message ?? "저장하지 못했습니다. 입력값과 DB 설정을 확인해주세요.", message ? 409 : 400);
 }
 return ok({ saved: true });
}
