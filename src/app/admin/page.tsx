import {Suspense} from "react";
import {readAllPages} from "@/lib/query-pagination";
import {canAdminister} from "@/lib/auth/account-access";
import {MemberDelete} from "@/components/admin/member-delete";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentPageProfile as getCurrentProfile,isStaffOrAdmin} from "@/lib/auth/current-user";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {MemberDirectory} from "@/components/admin/member-directory";
import {WithdrawalActions} from "@/components/admin/withdrawal-actions";
import {SeasonManager} from "@/components/admin/season-manager";
import {loadRegularTemplates} from "@/lib/regular-run-templates-server";
import {RegularTemplateManager} from "@/components/schedules/regular-template-manager";
import {OperationsSettings} from "@/components/admin/operations-settings";


export default async function AdminPage({searchParams}:{searchParams:Promise<{tab?:string}>}) {
 const profile=await getCurrentProfile();if(!profile||!isStaffOrAdmin(profile))redirect('/dashboard');
 const canEdit=canAdminister(profile),isAdmin=profile.role==='admin',client=createSupabaseAdminClient();
 const tabs=[['members',canEdit?'회원 관리':'회원 조회'],...(canEdit?[['seasons','시즌 관리']]:[]),['templates','정기런 양식 관리'],...(canEdit?[['scores','환경 설정']]:[])];
 const requested=(await searchParams).tab;if(requested==='operations'&&isAdmin)redirect('/admin/operations');if(requested==='season-settings'&&canEdit)redirect('/admin?tab=seasons');const tab=tabs.some(([key])=>key===requested)?requested:'members';
 const heading=tabs.find(([key])=>key===tab)?.[1];
 let members=null,seasons=null,setting=null,withdrawals=null;
 const templates=tab==='templates'?await loadRegularTemplates():[];
 if(tab==='members'){
  let query=client.from('profiles').select('user_id,login_id,name,nickname,role,admin_account,admin_mode_normal,staff_position,account_status,ranking_excluded,is_pacer').order('created_at',{ascending:false}).order('user_id');
  if(!isAdmin)query=query.neq('role','admin');
  const [rows,withdrawalResult]=await Promise.all([
   readAllPages((from,to)=>query.range(from,to)),
   canEdit?client.from('withdrawal_requests').select('*,profiles:user_id(name,role)').in('status',['pending','approved']).is('auth_deleted_at',null):Promise.resolve({data:[],error:null}),
  ]);
  members=rows;
  if(withdrawalResult.error)throw new Error('탈퇴 신청을 불러오지 못했습니다.');
  withdrawals=(withdrawalResult.data??[]).filter(w=>isAdmin||(Array.isArray(w.profiles)?w.profiles[0]?.role:w.profiles?.role)!=='admin');
 }
 if(tab==='seasons'){const result=await client.from('seasons').select('*').order('starts_on',{ascending:false});if(result.error)throw new Error('시즌을 불러오지 못했습니다.');seasons=result.data;}
 if(tab==='scores'){const result=await client.from('system_settings').select('setting_value').eq('setting_key','score_policy').maybeSingle();if(result.error)throw new Error('설정을 불러오지 못했습니다.');setting=result.data?.setting_value??{};}
 return <main><header className="page-heading"><div><h1>크루 관리</h1><p className="page-description">회원과 시즌, 정기런 양식, 활동 환경을 관리합니다.</p></div><Link href="/dashboard" className="button-secondary">크루 홈</Link></header>
 <nav className="management-tabs" aria-label="크루 관리 메뉴">{tabs.map(([key,label])=><Link key={key} href={`/admin?tab=${key}`} aria-current={tab===key?'page':undefined}>{label}</Link>)}</nav>
 <section className="mt-6"><h2 className="mb-4 text-xl font-bold">{heading}</h2>
 {tab==='members'&&<>{Boolean(withdrawals?.length)&&<section className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="font-bold">탈퇴 승인</h3>{withdrawals?.map(w=><div key={w.request_id} className="mt-4 flex flex-wrap items-center justify-between gap-3"><span>{Array.isArray(w.profiles)?w.profiles[0]?.name:w.profiles?.name}</span><WithdrawalActions requestId={w.request_id} retry={w.status==='approved'}/></div>)}</section>}
 {isAdmin&&<Suspense fallback={null}><FailedDeletions/></Suspense>}
 <MemberDirectory members={members??[]} canEdit={canEdit} isAdmin={isAdmin} selfId={profile.user_id}/></>}
 {tab==='seasons'&&<SeasonManager seasons={seasons??[]}/>}
 {tab==='templates'&&<><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-600">정기런 양식을 추가·수정·삭제합니다. 날짜와 시간은 일정을 만들 때 입력합니다.</p></div><p className="mt-2 text-xs text-zinc-500">양식 정보 수정은 새 일정의 기본값에 적용됩니다. 사진 교체는 해당 양식을 사용하는 기존 일정에도 반영됩니다.</p><RegularTemplateManager templates={templates}/></>}

 {tab==='scores'&&<><p className="mb-4 text-sm text-zinc-600">출석·지각·페이서 활동 점수와 최소 활동 기준을 설정합니다.</p><OperationsSettings maintenance={{}} scorePolicy={setting??{}} scoresOnly/></>}

 </section></main>;
}

async function FailedDeletions(){
 const {data,error}=await createSupabaseAdminClient().from('member_deletion_jobs').select('job_id,target_user_id,confirmation_login_id,status').neq('status','completed').order('created_at');
 if(error)return <p className="mb-4 text-sm text-amber-800">사용자 삭제 작업을 확인하지 못했습니다.</p>;
 if(!data?.length)return null;
 return <section className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="font-bold">완료되지 않은 사용자 삭제</h3>{data.map(job=><div key={job.job_id} className="mt-3"><b>{job.confirmation_login_id??'삭제 대상 계정'}</b><MemberDelete userId={job.target_user_id} loginId={job.confirmation_login_id??''} name={job.confirmation_login_id??'삭제 대상'} retry/></div>)}</section>;
}
