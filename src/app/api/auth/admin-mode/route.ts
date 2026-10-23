import {getCurrentProfile} from '@/lib/auth/current-user';
import {canSwitchAdministratorMode} from '@/lib/auth/account-access';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {fail,ok} from '@/lib/api-response';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN','허용되지 않은 요청입니다.',403);
 const p=await getCurrentProfile();if(!p)return fail('UNAUTHORIZED','로그인이 필요합니다.',401);
 if(!canSwitchAdministratorMode(p))return fail('FORBIDDEN','활성 관리자 계정만 모드를 변경할 수 있습니다.',403);
 let mode;
 try{const raw=await request.text();if(raw.length>200)return fail('INVALID_INPUT','모드를 확인해주세요.');const body=JSON.parse(raw);if(!['admin','normal'].includes(body?.mode))throw Error();mode=body.mode;}catch{return fail('INVALID_INPUT','모드를 확인해주세요.');}
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc('set_administrator_mode',{normal_mode:mode==='normal'});
 if(error)return fail('MODE_CHANGE_FAILED',error.message==='FORBIDDEN'?'현재 계정 상태에서는 모드를 변경할 수 없습니다.':'모드를 변경하지 못했습니다. 031 마이그레이션과 연결 상태를 확인해주세요.',409);
 const response=ok({mode:data.mode,destination:'/dashboard'});response.headers.set('Cache-Control','private, no-store');return response;
}
