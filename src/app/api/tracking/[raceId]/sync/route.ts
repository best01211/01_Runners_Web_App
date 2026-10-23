import {canUseService} from '@/lib/auth/account-access';
import {getCurrentProfile} from '@/lib/auth/current-user';
import {ok,fail} from '@/lib/api-response';
import {isUUID} from '@/lib/race-tracking/validation';
import {synchronizeTracking} from '@/lib/race-tracking/sync-server';
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{raceId:string}>}){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const p=await getCurrentProfile();if(!p)return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 if(!canUseService(p)||p.service_blocked?.liveTracking)return fail('FORBIDDEN','현재 추적 기능을 이용할 수 없습니다.',403);
 const {raceId}=await params;if(!isUUID(raceId))return fail('NOT_FOUND','대회를 찾을 수 없습니다.',404);
 try{const response=ok(await synchronizeTracking(raceId));response.headers.set('Cache-Control','private, no-store');return response;}
 catch{return fail('SYNC_FAILED','기록을 갱신하지 못했습니다. DB 설정과 연결 상태를 확인해주세요.',503);}
}
