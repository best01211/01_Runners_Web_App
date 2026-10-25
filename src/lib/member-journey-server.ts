import {cache} from 'react';
import {createSupabaseAdminClient} from './supabase/admin';
import type {ScheduleSummary} from './schedule-overview';

export type MySchedule=ScheduleSummary&{participationId:string;eventRole:string|null;cancellationDeadline:string|null;attendanceStatus:string|null;deleted_at?:string|null};
export const loadMySchedules=cache(async(userId:string):Promise<MySchedule[]>=>{
 const client=createSupabaseAdminClient(),rows:MySchedule[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await client.from('schedule_participations').select('participation_id,event_role,schedules:schedule_id(schedule_id,title,schedule_type,status,location,start_at,end_at,registration_end_at,capacity,cancellation_deadline_at,deleted_at)').eq('user_id',userId).in('status',['registered','completed']).order('participation_id').range(offset,offset+499);
  if(error)throw new Error('내 신청 일정을 불러오지 못했습니다.');
  for(const row of data??[]){const s=Array.isArray(row.schedules)?row.schedules[0]:row.schedules;if(s&&!s.deleted_at)rows.push({...s,participationId:row.participation_id,eventRole:row.event_role,cancellationDeadline:s.cancellation_deadline_at,attendanceStatus:null} as MySchedule);}
  if((data?.length??0)<500)break;
 }
 for(let i=0;i<rows.length;i+=100){
  const {data,error}=await client.from('attendances').select('schedule_id,status').eq('user_id',userId).in('schedule_id',rows.slice(i,i+100).map(s=>s.schedule_id));
  if(error)throw new Error('내 출석 상태를 불러오지 못했습니다.');
  for(const a of data??[]){const s=rows.find(s=>s.schedule_id===a.schedule_id);if(s)s.attendanceStatus=a.status;}
 }
 return rows.sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
});
export function upcomingMine(rows:MySchedule[],now:string){return rows.filter(s=>!['cancelled','completed'].includes(s.status)&&Date.parse(s.end_at??s.start_at)>=Date.parse(now));}
