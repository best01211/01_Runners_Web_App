import {fetchPublicTimingHTML,parsePublicTimingPlayer} from './myresult-public';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {inspectTimingSource} from './myresult-server';
import {myResultSource,parseTimingPlayer,TimingError} from './myresult';
export async function synchronizeTracking(raceId:string,manualRefresh=false){
 const admin=createSupabaseAdminClient();
 const {data:lease,error}=await admin.rpc('claim_tracking_sync',{target_race:raceId,manual_refresh:manualRefresh});
 if(error)throw new Error('SYNC_DATABASE_ERROR');
 if(!lease)return {status:'waiting'};
 let status='synced',message='기록 제공처의 최신 응답을 확인했습니다.',cursor:string|null=null;
 const records:ReturnType<typeof parseTimingPlayer>=[];
 try{
  const source=myResultSource(lease.url);
  const event=await inspectTimingSource(source.url);
  const {data:course,error:courseError}=await admin.from('tracking_races').select('distance_meters,start_at').eq('race_id',raceId).single();
  if(courseError||!course)throw new Error('DATABASE_ERROR');
  const providerCourse=event.courses.find(c=>c.code===lease.code);
  const localDate=new Date(Date.parse(course.start_at)+9*3600000).toISOString().slice(0,10);
  if(!providerCourse||Math.abs(providerCourse.distanceMeters-course.distance_meters)>50||localDate!==event.date)throw new TimingError('COURSE_MISMATCH','연결된 대회 날짜·종목·공식 거리를 확인해주세요.');
  let query=admin.from('tracking_race_entries').select('entry_id,bib').eq('race_id',raceId).eq('status','running').is('deleted_at',null).order('entry_id').limit(40);
  if(lease.cursor)query=query.gt('entry_id',lease.cursor);
  const {data:entries,error:entryError}=await query;if(entryError)throw new Error('DATABASE_ERROR');
  // At most 40 individual requests, four at once, with a 4.5s per-request deadline.
  const candidates=entries??[];let index=0,stop=false;const failures=new Set<string>();
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{
   while(index<candidates.length&&!stop){const entry=candidates[index++];
    try{const response=await fetchPublicTimingHTML(source.url,entry.bib);
     records.push(...parsePublicTimingPlayer(response,event,lease.code,entry.bib,entry.entry_id,course.distance_meters,course.start_at,Date.now()));
    }catch(e){const code=e instanceof TimingError?e.code:'UPSTREAM_ERROR';failures.add(code);if(['AUTH_REQUIRED','RATE_LIMIT'].includes(code))stop=true;}
   }
  }));
  if(failures.size){status=failures.has('AUTH_REQUIRED')?'auth-required':failures.has('RATE_LIMIT')?'rate-limit':'partial';message=failures.has('AUTH_REQUIRED')?'공개 기록 페이지 접근이 제한되었습니다.':failures.has('RATE_LIMIT')?'기록 제공처의 요청 제한으로 잠시 대기합니다.':'일부 배번호의 대회·종목·기록 또는 연결 상태를 확인해주세요.';}
  cursor=stop?lease.cursor??null:candidates.length===40?candidates.at(-1)!.entry_id:null;
 }catch(e){status=e instanceof TimingError&&e.code==='AUTH_REQUIRED'?'auth-required':'error';message=e instanceof TimingError?e.message:'기록 제공처 연결 또는 데이터 확인이 필요합니다.';cursor=lease.cursor??null;}
 const {error:applyError}=await admin.rpc('apply_tracking_sync',{target_race:raceId,token:lease.token,source_version:lease.version,records,next_cursor:cursor,sync_status:status,sync_message:message});
 if(applyError){if(['STALE_SOURCE','STALE_LEASE'].includes(applyError.message))return {status:'waiting'};throw new Error('SYNC_DATABASE_ERROR');}
 return {status};
}
