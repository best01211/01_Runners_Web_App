import { notFound, redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProfileForm } from "@/components/profile/profile-form";
import { PasswordForm } from "@/components/profile/password-form";
import { WithdrawalForm } from "@/components/profile/withdrawal-form";

export default async function ProfilePage(){const profile=await getCurrentProfile();if(!profile)redirect("/login");const{data}=await createSupabaseAdminClient().from("profiles").select("email,phone,nickname,profile_image_url").eq("user_id",profile.user_id).single();if(!data)notFound();const {data:auth}=await getCurrentUser();return <main className="mx-auto min-h-screen max-w-xl px-6 py-12"><header className="profile-header"><p className="eyebrow">회원 정보</p><h1>내 정보</h1><p>프로필과 계정 정보를 관리합니다. 이름은 본인의 실제 이름을 입력해주세요.</p></header><div className="profile-content"><ProfileForm readOnly={Boolean(profile.service_blocked?.profile)} initial={{name:profile.name,email:auth.user?.email??data.email??"",phone:data.phone??"",nickname:data.nickname,profile_image_url:data.profile_image_url}}/><PasswordForm readOnly={Boolean(profile.service_blocked?.profile)}/>{profile.role!=="admin"&&<WithdrawalForm/>}</div></main>}
