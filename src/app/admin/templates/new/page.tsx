import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentProfile,isStaffOrAdmin} from '@/lib/auth/current-user';
import {RegularTemplateForm} from '@/components/schedules/regular-template-form';

export default async function NewRegularTemplatePage(){
 const profile=await getCurrentProfile();if(!isStaffOrAdmin(profile))redirect('/dashboard');
 return <main className="mx-auto w-full max-w-3xl"><header className="page-heading"><div><h1>정기런 양식 추가</h1><p className="page-description">반복해서 사용할 장소·설명·페이스 그룹과 사진을 등록합니다.</p></div><Link href="/admin?tab=templates" className="button-secondary">← 양식 목록</Link></header><RegularTemplateForm/></main>;
}
