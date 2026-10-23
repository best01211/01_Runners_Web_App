import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {scheduleFields,nextMonthAt,selectUpcomingSchedules,monthRange,type ScheduleSummary} from './schedule-overview';

export async function loadUpcomingSchedules(now:string,includeFlash=true):Promise<ScheduleSummary[]>{
 const client=createSupabaseAdminClient(),rows:ScheduleSummary[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await client.rpc('get_upcoming_schedule_summaries',{at_time:now,until_time:nextMonthAt(now),include_flash:includeFlash}).range(offset,offset+499);
  if(error){
   // Deploy-safe fallback until SQL 026 is installed. Other DB errors fail visibly.
   if(offset===0&&['PGRST202','42883'].includes(error.code))return loadUpcomingSchedulesLegacy(now,includeFlash);
   throw new Error('일정 목록을 불러오지 못했습니다.');
  }
  rows.push(...(data??[]) as ScheduleSummary[]);
  if((data?.length??0)<500)return selectUpcomingSchedules(rows,now,includeFlash);
 }
}
async function loadUpcomingSchedulesLegacy(now:string,includeFlash:boolean):Promise<ScheduleSummary[]>{
 const client=createSupabaseAdminClient();
 const nearest=async(type:string)=>{
  const {data,error}=await client.from('schedules').select(scheduleFields).is('deleted_at',null).eq('schedule_type',type).neq('status','completed').neq('status','cancelled').gte('end_at',now).order('start_at').order('schedule_id').limit(1);
  if(error)throw new Error('일정 목록을 불러오지 못했습니다.');return data as unknown as ScheduleSummary[];
 };
 const shortTerm=async()=>{
  const rows:ScheduleSummary[]=[];
  for(let offset=0;;offset+=500){
   const {data,error}=await client.from('schedules').select(scheduleFields).is('deleted_at',null).in('schedule_type',includeFlash?['event','flash']:['event']).neq('status','completed').neq('status','cancelled').gte('end_at',now).lte('start_at',nextMonthAt(now)).order('start_at').order('schedule_id').range(offset,offset+499);
   if(error)throw new Error('일정 목록을 불러오지 못했습니다.');rows.push(...data as unknown as ScheduleSummary[]);if(data.length<500)break;
  }return rows;
 };
 return selectUpcomingSchedules((await Promise.all([nearest('regular'),nearest('training'),shortTerm()])).flat(),now,includeFlash);
}
export async function loadScheduleHistoryOrMonth(now:string,month?:string):Promise<ScheduleSummary[]>{
 const rows:ScheduleSummary[]=[];const range=month?monthRange(month):null;
 for(let offset=0;;offset+=500){
  let query=createSupabaseAdminClient().from('schedules').select(scheduleFields).is('deleted_at',null);
  query=range?query.gte('start_at',range.start).lt('start_at',range.end):query.or(`end_at.lt.${now},status.eq.completed,status.eq.cancelled`);
  const {data,error}=await query.order('start_at',{ascending:Boolean(month)}).order('schedule_id').range(offset,offset+499);
  if(error)throw new Error('일정 목록을 불러오지 못했습니다.');rows.push(...data as unknown as ScheduleSummary[]);if(data.length<500)break;
 }return rows;
}
