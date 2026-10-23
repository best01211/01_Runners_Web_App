import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentPageProfile as getCurrentProfile,isStaffOrAdmin} from '@/lib/auth/current-user';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {ServiceSettings} from '@/components/admin/service-settings';

export default async function AdminOperationsPage(){
 const profile=await getCurrentProfile();if(!profile||!isStaffOrAdmin(profile)||profile.role!=='admin')redirect('/dashboard');
 const {data,error}=await createSupabaseAdminClient().from('system_settings').select('setting_value').eq('setting_key','maintenance').maybeSingle();
 if(error)throw new Error('운영 설정을 불러오지 못했습니다.');
 return <main><header className="page-heading"><div><h1>관리자 · 운영 설정</h1><p className="page-description">서비스 점검과 접속·기능 제한을 관리합니다.</p></div><Link href="/dashboard" className="button-secondary">크루 홈</Link></header><ServiceSettings initial={data?.setting_value??{}}/></main>;
}
