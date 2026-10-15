import {getCurrentProfile,isStaffOrAdmin} from '@/lib/auth/current-user';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {fail} from '@/lib/api-response';
import {attendanceLabels,csvCell,memberRole,uuidPattern} from '@/lib/member-directory';
import {memberAttendance} from '@/lib/member-attendance';

export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const actor=await getCurrentProfile();if(!actor||!isStaffOrAdmin(actor))return fail('FORBIDDEN','출석 다운로드 권한이 없습니다.',403);
 let body;try{const text=await request.text();if(text.length>25000)return fail('INVALID_SELECTION','한 번에 최대 500명을 선택해주세요.');body=JSON.parse(text);}catch{return fail('INVALID_JSON','선택한 회원을 확인해주세요.');}
 if(!Array.isArray(body?.userIds)||!body.userIds.length||body.userIds.length>500||body.userIds.some((id:unknown)=>typeof id!=='string'||!uuidPattern.test(id)))return fail('INVALID_SELECTION','1~500명의 회원을 선택해주세요.');
 const ids:string[]=[...new Set<string>(body.userIds)];
 let query=createSupabaseAdminClient().from('profiles').select('user_id,name,nickname,role,staff_position').in('user_id',ids);
 if(actor.role!=='admin')query=query.neq('role','admin');
 const {data:members,error}=await query;
 if(error)return fail('LOAD_FAILED','회원 정보를 불러오지 못했습니다.',500);
 if(members.length!==ids.length)return fail('FORBIDDEN','조회할 수 없는 회원이 포함되어 있습니다. 목록을 새로고침해주세요.',403);
 try{
  const records=await memberAttendance(ids);
  const rows:unknown[][]=[['이름','닉네임','역할','일정','일정 시간(한국)','장소','일정 상태','출석 상태','확인 방식','확인 시간(한국)']];
  const date=(v:string|null)=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'';
  for(const m of members){const own=records.filter(r=>r.user_id===m.user_id);if(!own.length)rows.push([m.name,m.nickname,memberRole(m.role,m.staff_position),'','','','','기록 없음','','']);
   for(const r of own){const s=r.schedules;rows.push([m.name,m.nickname,memberRole(m.role,m.staff_position),s?.title,date(s?.start_at??null),s?.location,s?.deleted_at?'삭제된 일정':s?.status==='cancelled'?'취소':s?.status==='completed'?'종료':'진행',attendanceLabels[r.status]??r.status,r.method==='manual'?'수동':r.method==='code'?'출석 번호':'',date(r.checked_at)]);}
  }
  const filename='runners-attendance-'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})+'.csv';
  return new Response('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store'}});
 }catch{return fail('EXPORT_FAILED','출석 파일을 만들지 못했습니다. 다시 시도해주세요.',500);}
}
