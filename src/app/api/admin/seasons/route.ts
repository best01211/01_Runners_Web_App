import {readJsonObject} from '@/lib/request-json';
import {isUUID} from '@/lib/race-tracking/validation';
import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile, isStaffOrAdmin } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {canAdminister} from "@/lib/auth/account-access";
export async function PATCH(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const p=await getCurrentProfile();if(!p||!canAdminister(p))return fail('FORBIDDEN','시즌 설정 권한이 없습니다.',403);
 let b;try{b=await request.json();}catch{return fail('INVALID_JSON','입력값을 확인해주세요.');}
 const validDate=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.seasonId!=='string'||!validDate(b.startsOn)||!validDate(b.endsOn)||b.startsOn>b.endsOn||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.isPublic!=='boolean'||typeof b.makeCurrent!=='boolean'||!['scheduled','active','closed','hidden'].includes(b.status))return fail('INVALID_INPUT','시즌 이름·기간·공개 여부를 확인해주세요.');
 const client=await createSupabaseServerClient();const {data,error}=await client.rpc('configure_season',{target_season:b.seasonId,payload:b});
 return error?fail('UPDATE_FAILED','시즌 설정을 저장하지 못했습니다. 현재 시즌은 오늘을 포함하는 기간으로 설정하고 공개해주세요. SQL 021 적용 여부도 확인해주세요.',409):ok({season:data});
}
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.account_status !== "active" || profile.approval_status !== "approved") return fail("FORBIDDEN", "이용 권한이 필요합니다.", 403);
  let query = createSupabaseAdminClient().from("seasons").select("*").order("starts_on", { ascending: false });
  if (!isStaffOrAdmin(profile)) query = query.eq("is_public", true).neq("status", "hidden");
  const { data, error } = await query;
  return error ? fail("DATABASE_ERROR", "시즌을 불러오지 못했습니다.", 500) : ok({ seasons: data });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
  let body;
  try { body = await request.json(); } catch { return fail("INVALID_JSON", "입력값을 확인해주세요."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_JSON", "입력값을 확인해주세요.");
  const starts = String(body.startsOn ?? ""), ends = String(body.endsOn ?? "");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!String(body.name ?? "").trim() || !validDate(starts) || !validDate(ends) || starts > ends || !["scheduled", "active", "closed", "hidden"].includes(body.status ?? "scheduled")) return fail("INVALID_PERIOD", "시즌 이름과 기간·상태를 확인해주세요.");
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("create_season", { payload: body });
  return error ? fail("CREATE_FAILED", "시즌 생성에 실패했습니다. 기본 시즌은 공개 상태여야 합니다.", 409) : ok({ season: data }, 201);
}

export async function DELETE(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const profile=await getCurrentProfile();if(!profile||!canAdminister(profile))return fail('FORBIDDEN','시즌 삭제 권한이 없습니다.',403);
 const body=await readJsonObject(request);
 if(!body||!isUUID(body.seasonId)||body.confirmation!=='시즌 삭제')return fail('INVALID_INPUT','삭제할 시즌을 확인해주세요.');
 const {data,error}=await createSupabaseAdminClient().from('seasons').delete().eq('season_id',body.seasonId).select('season_id').maybeSingle();
 if(error)return fail('DELETE_FAILED',error.code==='23503'?'이 시즌을 참조하는 기록이 있어 삭제할 수 없습니다.':'시즌을 삭제하지 못했습니다. 다시 시도해주세요.',409);
 if(!data)return fail('NOT_FOUND','이미 삭제되었거나 존재하지 않는 시즌입니다.',404);
 return ok({deleted:true,seasonId:data.season_id});
}
