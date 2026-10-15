import {redirect} from "next/navigation";
import {getCurrentProfile} from "@/lib/auth/current-user";
import {loadUpcomingSchedules} from "@/lib/schedule-overview-server";
import {DashboardView} from "@/components/dashboard/dashboard-view";
import {loadRanking} from "@/lib/ranking-server";
import {canAdminister} from "@/lib/auth/account-access";

export default async function DashboardPage() {
  const profile=await getCurrentProfile();
  if(!profile)redirect("/login");
  const now=new Date().toISOString();
  const [scheduleResult,activityResult]=await Promise.allSettled([loadUpcomingSchedules(now,false),loadRanking(undefined,canAdminister(profile),profile.user_id)]);
  const schedules=scheduleResult.status==='fulfilled'?scheduleResult.value:null;
  return <DashboardView profile={profile} schedules={schedules??[]} now={now} scheduleError={!schedules} activity={activityResult.status==='fulfilled'?activityResult.value.personalActivity:null} activityError={activityResult.status==='rejected'}/>;
}
