import Link from 'next/link';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {AccountHelpRequest,ApprovalHelp} from '@/components/auth/account-help';
import {loadCrewSupportUrl} from '@/lib/crew-support';
export const metadata={title:'아이디·가입 상태 찾기 | 2001 Runners'};
export default async function Page({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 const {data:{user}}=await(await createSupabaseServerClient()).auth.getUser();
 const result=user?await createSupabaseAdminClient().from('profiles').select('login_id,approval_status,account_status').eq('user_id',user.id).maybeSingle():null;
 const p=result?.data;
 return <main className="mx-auto min-h-screen max-w-lg space-y-5 px-5 py-12"><h1 className="text-2xl font-bold">아이디·가입 승인 상태 확인</h1>{error&&<p role="alert">확인 링크가 만료되었거나 유효하지 않습니다. 아래에서 메일을 다시 요청해주세요.</p>}{p&&!error?<section className="space-y-4 rounded-xl border p-5"><p>현재 로그인한 내 계정 정보입니다.</p><dl className="space-y-3"><div><dt>내 로그인 아이디</dt><dd className="text-xl font-bold">{p.login_id}</dd></div><div><dt>가입 승인</dt><dd>{{pending:'운영진 승인 대기',approved:'승인 완료',rejected:'승인 거절',cancelled:'신청 취소'}[p.approval_status as string]??'운영진 확인 필요'}</dd></div></dl><p>이메일 본인 확인과 크루 가입 승인은 별도 단계입니다. 승인 대기 중에는 회원 기능을 이용할 수 없습니다.</p><Link className="button-primary" href={p.approval_status==='approved'?'/dashboard':'/pending'}>계속하기</Link><form action="/api/auth/logout" method="post"><button className="button-secondary">다른 계정으로 로그인</button></form></section>:<><AccountHelpRequest/>{result?.error&&<p role="alert">계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>}</>}<ApprovalHelp supportUrl={await loadCrewSupportUrl()}/></main>;
}
