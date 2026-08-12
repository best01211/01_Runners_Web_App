import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProfileForm } from "@/components/profile/profile-form";
import { WithdrawalForm } from "@/components/profile/withdrawal-form";
export default async function Page(){const p=await getCurrentProfile();if(!p)redirect("/login");const{data}=await createSupabaseAdminClient().from("profiles").select("email,phone,nickname,profile_image_url").eq("user_id",p.user_id).single();if(!data)notFound();return <main className="mx-auto min-h-screen max-w-xl px-6 py-12"><h1 className="text-3xl font-black">내 정보</h1><p className="mt-2 text-zinc-500">이름은 변경할 수 없습니다.</p><ProfileForm initial={{email:data.email??"",phone:data.phone??"",nickname:data.nickname,profile_image_url:data.profile_image_url}}/>{p.role!=="admin"&&<WithdrawalForm/>}</main>}
