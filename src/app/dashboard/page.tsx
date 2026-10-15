import {redirect} from "next/navigation";
import {getCurrentProfile} from "@/lib/auth/current-user";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {DashboardView} from "@/components/dashboard/dashboard-view";
import {loadRanking} from "@/lib/ranking-server";
import {canAdminister} from "@/lib/auth/account-access";

export default async function DashboardPage() {
  const profile=await getCurrentProfile();
  if(!profile)redirect("/login");
  const now=new Date().toISOString();
  const [scheduleResult,activityResult]=await Promise.allSettled([createSupabaseAdminClient().from("schedules")
    .select("schedule_id,title,schedule_type,status,location,start_at,registration_end_at,capacity")
    .is("deleted_at",null).neq("status","cancelled").gte("end_at",now).order("start_at").limit(3),loadRanking(undefined,canAdminister(profile),profile.user_id)]);
  const schedules=scheduleResult.status==='fulfilled'?scheduleResult.value:null;
  return <DashboardView profile={profile} schedules={schedules?.data??[]} now={now} scheduleError={!schedules||Boolean(schedules.error)} activity={activityResult.status==='fulfilled'?activityResult.value.personalActivity:null} activityError={activityResult.status==='rejected'}/>;
}
