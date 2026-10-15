import {resolveRankingSeason} from "@/lib/ranking-seasons";
import {buildPersonalActivity} from "@/lib/personal-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildRanking, DEFAULT_SCORE_POLICY, parseScorePolicy, type RankingAttendance } from "@/lib/ranking";
export async function loadRanking(seasonId?: string | null, adminAccess = false, currentUserId?:string) {
 const client = createSupabaseAdminClient();
 let seasonsQuery = client.from("seasons").select("season_id,name,starts_on,ends_on,is_default,status,is_public").order("starts_on", { ascending: false });
 if (!adminAccess) seasonsQuery = seasonsQuery.eq("is_public", true).neq("status", "hidden");
 const { data: seasons, error: seasonsError } = await seasonsQuery;
 if (seasonsError) throw new Error("시즌 조회에 실패했습니다.");
 const selection=resolveRankingSeason(seasons??[],seasonId);
 const season=selection.season;
 const { data: setting, error: settingError } = await client.from("system_settings").select("setting_value").eq("setting_key", "score_policy").maybeSingle();
 if (settingError) throw new Error("점수 정책 조회에 실패했습니다.");
 const policy = setting ? parseScorePolicy(setting.setting_value) : DEFAULT_SCORE_POLICY;
 if (!policy) throw new Error("저장된 점수 정책을 확인해주세요.");
 let query = client.from("attendances").select("user_id,schedule_id,status,profiles:profiles!attendances_user_id_fkey!inner(login_id,name,nickname,role,account_status,approval_status,ranking_excluded,is_test_account),schedules:schedules!attendances_schedule_id_fkey!inner(start_at,status,deleted_at)").in("status", ["attended", "late", "absent"]).order("attendance_id");
 if (season) query = query.gte("schedules.start_at", `${season.starts_on}T00:00:00+09:00`).lt("schedules.start_at", new Date(Date.parse(`${season.ends_on}T00:00:00+09:00`) + 86400000).toISOString());
 // Page through attendance records so the PostgREST row limit cannot truncate scores.
 const rows: RankingAttendance[] = [];
 for (let offset = 0; ; offset += 500) {
  const { data, error } = await query.range(offset, offset + 499);
  if (error) { console.error("Ranking attendance query failed", {code:error.code,message:error.message,details:error.details,hint:error.hint}); throw new Error(`출석 조회에 실패했습니다. [${error.code}]${adminAccess ? ` ${error.message}` : ""}`); }
  rows.push(...data as unknown as RankingAttendance[]);
  if (data.length < 500) break;
 }
 const pacers = new Set<string>();
 const scheduleIds = [...new Set(rows.map(r => r.schedule_id))];
 for (let i = 0; i < scheduleIds.length; i += 100) {
  for (let offset = 0; ; offset += 500) {
   const { data, error } = await client.from("schedule_participations").select("schedule_id,user_id").in("schedule_id", scheduleIds.slice(i,i+100)).eq("is_pacer", true).order("participation_id").range(offset,offset+499);
   if (error) throw new Error("페이서 조회에 실패했습니다.");
   for (const row of data) pacers.add(`${row.schedule_id}:${row.user_id}`);
   if (data.length < 500) break;
  }
 }
 return { ranking: buildRanking(rows,policy,pacers,season), season: season ?? null, seasons: selection.seasons, currentSeasonId:selection.currentSeasonId, policy,
  personalActivity:currentUserId?{...buildPersonalActivity(rows,policy,pacers,currentUserId,season),seasonName:season?.name??'전체 시즌'}:null };
}
