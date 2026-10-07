import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProfileForm } from "@/components/profile/profile-form";
import { PasswordForm } from "@/components/profile/password-form";
import { WithdrawalForm } from "@/components/profile/withdrawal-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function ProfilePage(){const profile=await getCurrentProfile();if(!profile)redirect("/login");const{data}=await createSupabaseAdminClient().from("profiles").select("email,phone,nickname,profile_image_url").eq("user_id",profile.user_id).single();if(!data)notFound();const {data:auth}=await (await createSupabaseServerClient()).auth.getUser();return <main className="mx-auto min-h-screen max-w-xl px-6 py-12"><h1 className="text-3xl font-black">내 정보</h1><p className="mt-2 text-zinc-500">이름은 변경할 수 없습니다.</p><ProfileForm initial={{email:auth.user?.email??data.email??"",phone:data.phone??"",nickname:data.nickname,profile_image_url:data.profile_image_url}}/><PasswordForm/>{profile.role!=="admin"&&<WithdrawalForm/>}</main>}
