import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getCurrentPageProfile as getCurrentProfile,isStaffOrAdmin} from '@/lib/auth/current-user';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {memberFields,memberRole,uuidPattern} from '@/lib/member-directory';
import {memberAttendance} from '@/lib/member-attendance';
import {MemberDetailView,type MemberDetail} from '@/components/admin/member-detail';
import {canAdminister} from '@/lib/auth/account-access';
import {MemberActions} from '@/components/admin/member-actions';

export default async function MemberDetailPage({params}:{params:Promise<{userId:string}>}){
 const actor=await getCurrentProfile();
 if(!actor||!isStaffOrAdmin(actor))redirect('/dashboard');
 const {userId}=await params;if(!uuidPattern.test(userId))notFound();
 let query=createSupabaseAdminClient().from('profiles').select(memberFields).eq('user_id',userId);
 if(actor.role!=='admin')query=query.neq('role','admin');
 const {data,error}=await query.maybeSingle();
 if(error)throw new Error('회원 정보를 불러오지 못했습니다.');
 if(!data)notFound();
 const member=data as unknown as MemberDetail;
 const attendances=await memberAttendance([userId]);
 return <main><header className="page-heading"><div><p className="page-description">크루 관리 · 회원 상세</p><h1>{member.name}</h1><p className="page-description">{member.nickname||'닉네임 없음'} · {memberRole(member.role,member.staff_position)}</p></div><Link href="/admin?tab=members" className="button-secondary">← 회원 목록</Link></header>
 {canAdminister(actor)&&member.approval_status==='approved'&&<section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4"><h2 className="mb-3 font-bold">계정 활성 설정</h2><MemberActions key={member.account_status} statusOnly userId={member.user_id} role={member.role} position={member.staff_position} status={member.account_status} excluded={member.ranking_excluded} actorIsAdmin={actor.role==='admin'} self={actor.user_id===member.user_id}/></section>}
 <MemberDetailView member={member} attendances={attendances}/></main>;
}
