import {createSupabaseServerClient} from '@/lib/supabase/server';
import {validateRecoveryEmail} from '@/lib/validation/password-recovery';
import {readJsonObject} from '@/lib/request-json';
import {fail,ok} from '@/lib/api-response';
export async function POST(request:Request){
 const origin=new URL(request.url).origin;if(request.headers.get('origin')!==origin)return fail('FORBIDDEN','올바른 페이지에서 요청해주세요.',403);
 const body=await readJsonObject(request),email=validateRecoveryEmail(body?.email);if(!email)return fail('INVALID_EMAIL','가입한 이메일을 입력해주세요.');
 const client=await createSupabaseServerClient();
 const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:`${origin}/auth/callback?flow=account-help`}});
 if(error&&error.status===429)return fail('RATE_LIMIT','메일 요청이 많습니다. 잠시 후 다시 시도해주세요.',429);
 if(error&&error.status&&error.status>=500)return fail('MAIL_UNAVAILABLE','메일 발송에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',503);
 // Never disclose whether an email has an account to an unauthenticated caller.
 return ok({message:'해당 이메일로 가입한 계정이 있다면 본인 확인 링크가 발송됩니다. 스팸함도 확인해주세요.'});
}
