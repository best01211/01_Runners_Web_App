import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getCurrentProfile,isStaffOrAdmin} from '@/lib/auth/current-user';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {RegularTemplateForm} from '@/components/schedules/regular-template-form';
import {UUID} from '@/lib/regular-run-templates';

export default async function EditRegularTemplatePage({params}:{params:Promise<{templateId:string}>}){
 const profile=await getCurrentProfile();if(!isStaffOrAdmin(profile))redirect('/dashboard');
 const {templateId}=await params;if(!UUID.test(templateId))notFound();
 const {data,error}=await createSupabaseAdminClient().from('regular_run_templates').select('template_id,name,description,location,capacity,image_url,deleted_at,pace_groups').eq('template_id',templateId).is('deleted_at',null).maybeSingle();
 if(error)throw new Error('정기런 양식을 불러오지 못했습니다.');if(!data)notFound();
 return <main className="mx-auto w-full max-w-3xl"><header className="page-heading"><div><h1>정기런 양식 수정</h1><p className="page-description">양식 정보는 새 일정의 기본값에 적용되며 사진 변경은 기존 일정에도 반영됩니다.</p></div><Link href="/admin?tab=templates" className="button-secondary">← 양식 목록</Link></header><RegularTemplateForm initial={data}/></main>;
}
