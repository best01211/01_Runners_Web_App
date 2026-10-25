import {getCurrentProfile} from '@/lib/auth/current-user';
import {canUseService} from '@/lib/auth/account-access';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {isUUID} from '@/lib/race-tracking/validation';
import {readJsonObject} from '@/lib/request-json';
import {fail,ok} from '@/lib/api-response';
export async function GET(request:Request){
 const p=await getCurrentProfile();if(!p||!canUseService(p))return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 const a=createSupabaseAdminClient(),url=new URL(request.url);
 const unread=await a.from('member_notifications').select('notification_id',{count:'exact',head:true}).eq('user_id',p.user_id).is('read_at',null);
 if(unread.error)return fail('LOAD_FAILED','알림을 불러오지 못했습니다.',503);
 if(url.searchParams.get('summary')==='1')return ok({unreadCount:unread.count??0});
 const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page')??'1')||1));
 const {data,error,count}=await a.from('member_notifications').select('notification_id,schedule_id,comment_id,kind,title,message,created_at,read_at,schedules:schedule_id(deleted_at)',{count:'exact'}).eq('user_id',p.user_id).order('created_at',{ascending:false}).order('notification_id').range((page-1)*20,page*20-1);
 return error?fail('LOAD_FAILED','알림을 불러오지 못했습니다.',503):ok({notifications:data,total:count??0,page,unreadCount:unread.count??0});
}
export async function PATCH(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const p=await getCurrentProfile();if(!p||!canUseService(p))return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 const body=await readJsonObject(request);if(!body||(body.all!==true&&!isUUID(body.notificationId)))return fail('INVALID_INPUT','읽을 알림을 선택해주세요.');
 let query=createSupabaseAdminClient().from('member_notifications').update({read_at:new Date().toISOString()}).eq('user_id',p.user_id).is('read_at',null);
 if(body.all!==true)query=query.eq('notification_id',body.notificationId);
 const {error}=await query;return error?fail('UPDATE_FAILED','알림 읽음 처리를 저장하지 못했습니다.',503):ok({saved:true});
}
