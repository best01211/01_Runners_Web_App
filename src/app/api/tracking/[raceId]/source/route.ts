import {canAdminister} from '@/lib/auth/account-access';
import {getCurrentProfile} from '@/lib/auth/current-user';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {ok,fail} from '@/lib/api-response';
import {isUUID} from '@/lib/race-tracking/validation';
import {myResultSource,TimingError} from '@/lib/race-tracking/myresult';
import {inspectTimingSource,timingCredentials} from '@/lib/race-tracking/myresult-server';
export async function POST(request:Request,{params}:{params:Promise<{raceId:string}>}){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const p=await getCurrentProfile();if(!p)return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 if(!canAdminister(p)||p.service_blocked?.liveTracking)return fail('FORBIDDEN','자동 수집 설정 권한이 없습니다.',403);
 const {raceId}=await params;if(!isUUID(raceId))return fail('NOT_FOUND','대회를 찾을 수 없습니다.',404);
 try{
  const raw=await request.text();if(raw.length>3000)return fail('TOO_LARGE','입력 크기가 너무 큽니다.',413);
  const body=JSON.parse(raw);if(typeof body?.url!=='string')return fail('INVALID_INPUT','기록 주소를 입력해주세요.');
  const source=myResultSource(body.url);
  if(body.action==='inspect')return ok({event:await inspectTimingSource(source.url),credentialsReady:!!timingCredentials(source.id),collectionMode:"public-page"});
  if(body.action!=='save'||typeof body.code!=='string'||typeof body.enabled!=='boolean')return fail('INVALID_INPUT','종목과 연동 여부를 확인해주세요.');
  const {data:course,error}=await createSupabaseAdminClient().from('tracking_races').select('distance_meters,start_at').eq('race_id',raceId).eq('status','active').maybeSingle();
  if(error||!course)return fail('NOT_FOUND','대회를 찾을 수 없습니다.',404);
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(body.code))return fail('INVALID_INPUT','종목 코드를 확인해주세요.');
  if(body.enabled){
   const event=await inspectTimingSource(source.url),selected=event.courses.find(c=>c.code===body.code);
   const localDate=new Date(Date.parse(course.start_at)+9*3600000).toISOString().slice(0,10);
   if(!selected||Math.abs(selected.distanceMeters-course.distance_meters)>50||localDate!==event.date)return fail('COURSE_MISMATCH','대회 날짜·공식 거리와 연결할 종목을 확인해주세요.');
  }
  const client=await createSupabaseServerClient();
  const result=await client.rpc('configure_tracking_source',{target_race:raceId,url:source.url,code:body.code,active:body.enabled});
  if(result.error)return fail('SAVE_FAILED',result.error.message==='SOURCE_LOCKED'?'수집 기록이 있어 대회 주소·종목 코드를 변경할 수 없습니다. 연동 중지는 가능합니다.':'자동 수집 설정을 저장하지 못했습니다. 030 마이그레이션과 권한을 확인해주세요.',409);
  return ok({saved:true,credentialsReady:!!timingCredentials(source.id)});
 }catch(e){return fail('SOURCE_ERROR',e instanceof TimingError?e.message:'대회 정보를 확인하지 못했습니다. 입력 주소와 제공처 연결을 확인해주세요.',400);}
}
