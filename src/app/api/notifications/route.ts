import {getCurrentProfile} from '@/lib/auth/current-user';
import {canUseService} from '@/lib/auth/account-access';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {isUUID} from '@/lib/race-tracking/validation';
import {readJsonObject} from '@/lib/request-json';
import {fail,ok} from '@/lib/api-response';
function notificationError(error:{code?:string},writing=false){
 if(['42P01','PGRST205'].includes(error.code??''))return fail('NOTIFICATIONS_NOT_CONFIGURED','알림 DB 설정이 아직 적용되지 않았습니다. 관리자에게 SQL 037 적용을 요청해주세요.',503);
 if(['42703','PGRST204','PGRST200'].includes(error.code??''))return fail('NOTIFICATIONS_SCHEMA_MISMATCH','알림 DB 구조를 확인하지 못했습니다. 관리자에게 SQL 037 적용 상태와 스키마 캐시 확인을 요청해주세요.',503);
 if(error.code==='42501')return fail('NOTIFICATIONS_PERMISSION_DENIED','알림 DB 접근 권한을 확인하지 못했습니다. 관리자에게 문의해주세요.',503);
 return fail(writing?'UPDATE_FAILED':'LOAD_FAILED',writing?'알림 읽음 처리를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.':'알림을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',503);
}
export async function GET(request:Request){
 const p=await getCurrentProfile();if(!p||!canUseService(p))return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 const a=createSupabaseAdminClient(),url=new URL(request.url);
 const unread=await a.from('member_notifications').select('notification_id',{count:'exact',head:true}).eq('user_id',p.user_id).is('read_at',null);
 if(unread.error)return notificationError(unread.error);
 if(url.searchParams.get('summary')==='1')return ok({unreadCount:unread.count??0});
 const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page')??'1')||1));
 const {data,error,count}=await a.from('member_notifications').select('notification_id,schedule_id,comment_id,kind,title,message,created_at,read_at,schedules:schedule_id(deleted_at)',{count:'exact'}).eq('user_id',p.user_id).order('created_at',{ascending:false}).order('notification_id').range((page-1)*20,page*20-1);
 return error?notificationError(error):ok({notifications:data,total:count??0,page,unreadCount:unread.count??0});
}
export async function PATCH(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const p=await getCurrentProfile();if(!p||!canUseService(p))return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 const body=await readJsonObject(request);if(!body||(body.all!==true&&!isUUID(body.notificationId)))return fail('INVALID_INPUT','읽을 알림을 선택해주세요.');
 let query=createSupabaseAdminClient().from('member_notifications').update({read_at:new Date().toISOString()}).eq('user_id',p.user_id).is('read_at',null);
 if(body.all!==true)query=query.eq('notification_id',body.notificationId);
 const {error}=await query;return error?notificationError(error,true):ok({saved:true});
}
