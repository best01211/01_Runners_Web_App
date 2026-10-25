import {getCurrentProfile} from '@/lib/auth/current-user';
import {canUseService} from '@/lib/auth/account-access';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {calendarExport} from '@/lib/calendar-export';
import {isUUID} from '@/lib/race-tracking/validation';
import {fail} from '@/lib/api-response';
export async function GET(request:Request,{params}:{params:Promise<{scheduleId:string}>}){
 const p=await getCurrentProfile();if(!p||!canUseService(p))return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 const {scheduleId}=await params;if(!isUUID(scheduleId))return fail('NOT_FOUND','일정을 찾을 수 없습니다.',404);
 const {data,error}=await createSupabaseAdminClient().from('schedules').select('schedule_id,title,description,location,start_at,end_at,status,deleted_at').eq('schedule_id',scheduleId).maybeSingle();
 if(error)return fail('LOAD_FAILED','일정을 불러오지 못했습니다.',503);
 if(!data||data.deleted_at)return fail('NOT_FOUND','일정을 찾을 수 없습니다.',404);
 return new Response(calendarExport(data,new URL(`/schedules/${scheduleId}`,request.url).href,new Date().toISOString()),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':`attachment; filename="runners-${scheduleId}.ics"`,'Cache-Control':'private, no-store'}});
}
