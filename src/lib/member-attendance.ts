import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import type {AttendanceRecord} from '@/lib/member-directory';

export async function memberAttendance(userIds:string[]){
 const client=createSupabaseAdminClient();const rows:AttendanceRecord[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await client.from('attendances').select('attendance_id,user_id,status,method,checked_at,schedules!attendances_schedule_id_fkey(title,start_at,location,status,deleted_at)').in('user_id',userIds).order('created_at',{ascending:false}).order('attendance_id').range(offset,offset+499);
  if(error)throw new Error('출석 기록을 불러오지 못했습니다.');
  rows.push(...data as unknown as AttendanceRecord[]);if(data.length<500)break;
 }
 return rows;
}
