import {fail,ok} from '@/lib/api-response';
import {getCurrentProfile,isStaffOrAdmin,canUseService} from '@/lib/auth/current-user';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {UUID} from '@/lib/regular-run-templates';
type Context={params:Promise<{scheduleId:string}>};

export async function GET(request:Request,{params}:Context){
 const actor=await getCurrentProfile();if(!actor||!canUseService(actor))return fail('FORBIDDEN','로그인이 필요합니다.',403);
 const {scheduleId}=await params;if(!UUID.test(scheduleId))return fail('INVALID_ID','일정을 확인해주세요.');
 const admin=createSupabaseAdminClient();
 const {data:schedule,error}=await admin.from('schedules').select('schedule_id,event_kind,event_registration_locked,capacity,status,registration_start_at,registration_end_at,end_at,guest_allowed,cancellation_deadline_at').eq('schedule_id',scheduleId).eq('schedule_type','event').is('deleted_at',null).maybeSingle();
 if(error)return fail('SETUP_REQUIRED','이벤트 신청 SQL(023) 적용 여부를 확인해주세요.',503);
 if(!schedule)return fail('NOT_FOUND','이벤트를 찾을 수 없습니다.',404);
 const search=new URL(request.url).searchParams.get('search');
 if(search!==null){
  if(!isStaffOrAdmin(actor))return fail('FORBIDDEN','회원 검색 권한이 없습니다.',403);
  const text=search.trim();if(!text||text.length>50)return fail('INVALID_NAME','검색할 회원 이름을 입력해주세요.');
  const escaped=text.replace(/[\\%_]/g,c=>'\\'+c);
  const {data:members,error:memberError}=await admin.from('profiles').select('user_id,name,nickname,login_id,role').eq('account_status','active').eq('approval_status','approved').in('role',schedule.guest_allowed?['member','staff','guest']:['member','staff']).ilike('name',`%${escaped}%`).order('name').limit(20);
  return memberError?fail('LOAD_FAILED','회원 이름을 검색하지 못했습니다.',500):ok({members});
 }
 const manager=isStaffOrAdmin(actor);
 const {data:participation,error:ownError}=await admin.from('schedule_participations').select('participation_id,user_id,status,event_role,participation_locked,pace_change_locked').eq('schedule_id',scheduleId).eq('user_id',actor.user_id).in('status',['registered','completed']).maybeSingle();
 if(ownError)return fail('LOAD_FAILED','내 신청을 불러오지 못했습니다.',500);
 const counts:Record<string,number>={runner:0,cheer:0,attendee:0};const roster:unknown[]=[];
 for(let offset=0;;offset+=500){
  const query=admin.from('schedule_participations').select(manager?'participation_id,user_id,event_role,profiles:user_id(name,nickname,login_id,role)':'participation_id,event_role').eq('schedule_id',scheduleId).in('status',['registered','completed']).not('user_id','is',null).order('participation_id').range(offset,offset+499);
  const {data,error:rowsError}=await query;if(rowsError)return fail('LOAD_FAILED','신청 인원을 불러오지 못했습니다.',500);
  for(const row of data as unknown as {event_role:string|null;profiles?:{role:string}|{role:string}[]|null}[]){counts[row.event_role??'attendee']=(counts[row.event_role??'attendee']??0)+1;if(manager){const p=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;if(actor.role==='admin'||p?.role!=='admin')roster.push(row);}}
  if(data.length<500)break;
 }
 return ok({schedule,participation,counts,...(manager?{roster}:{})});
}
async function write(request:Request,{params}:Context,changeOnly:boolean){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const actor=await getCurrentProfile();if(!actor||actor.account_status!=='active'||actor.approval_status!=='approved')return fail('FORBIDDEN','참석 신청 권한이 없습니다.',403);
 const {scheduleId}=await params;let body;
 try{body=await request.json();}catch{return fail('INVALID_INPUT','입력값을 확인해주세요.');}
 if(!body||typeof body!=='object'||Array.isArray(body)||!UUID.test(scheduleId)||!['runner','cheer','attendee'].includes(body.eventRole)||(body.userId!==undefined&&(typeof body.userId!=='string'||!UUID.test(body.userId)))||(body.managerAdd!==undefined&&typeof body.managerAdd!=='boolean'))return fail('INVALID_INPUT','참석 유형과 회원을 확인해주세요.');
 if(body.managerAdd===true&&!isStaffOrAdmin(actor))return fail('FORBIDDEN','운영진만 회원을 추가할 수 있습니다.',403);
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc('register_event_participation',{target_schedule_id:scheduleId,target_event_role:body.eventRole,target_user_id:body.userId??actor.user_id,manager_add:body.managerAdd===true,change_only:changeOnly});
 if(!error)return ok({participation:data},changeOnly?200:201);
 const messages:Record<string,string>={EVENT_REGISTRATION_LOCKED:'정원이 한 번 마감되어 일반 신청이 종료되었습니다. 빈자리 추가는 운영진에게 문의해주세요.',SCHEDULE_FULL:'정원이 마감되었습니다.',INVALID_EVENT_MEMBER:'활성·승인 완료 회원만 추가할 수 있습니다.',INVALID_EVENT_ROLE:'이벤트 참석 유형을 확인해주세요.',EVENT_CAPACITY_REQUIRED:'행사 정원을 먼저 설정해주세요.',REGISTRATION_NOT_STARTED:'아직 모집 시작 전입니다.',REGISTRATION_CLOSED:'모집이 종료되었습니다.',ALREADY_PARTICIPATING:'이미 신청한 회원입니다.',ACTIVE_PARTICIPATION_NOT_FOUND:'활성 신청을 찾을 수 없습니다.',PARTICIPATION_FORBIDDEN:'참석 신청 권한이 없습니다.',SCHEDULE_NOT_OPEN:'현재 신청할 수 없는 일정입니다.',SCHEDULE_NOT_FOUND:'취소되었거나 존재하지 않는 이벤트입니다.',GUEST_NOT_ALLOWED:'게스트 신청이 허용되지 않습니다.',PACE_CHANGE_LOCKED:'출석 시작 후에는 참석 유형을 바꿀 수 없습니다.',SERVICE_FEATURE_BLOCKED:'점검 중으로 참석 신청을 사용할 수 없습니다.'};
 const key=Object.keys(messages).find(k=>error.message===k||error.message.startsWith(k+':'));
 return fail(key??'SAVE_FAILED',key?messages[key]:'이벤트 신청에 실패했습니다. SQL(023) 적용 여부를 확인해주세요.',key==='PARTICIPATION_FORBIDDEN'?403:409);
}
export async function POST(request:Request,context:Context){return write(request,context,false);}
export async function PATCH(request:Request,context:Context){return write(request,context,true);}
