import {Suspense} from "react";
import {MyNextSchedule} from '@/components/dashboard/my-next-schedule';
import {measure} from "@/lib/performance";
import {redirect} from "next/navigation";
import {getCurrentPageProfile as getCurrentProfile} from "@/lib/auth/current-user";
import {loadUpcomingSchedules} from "@/lib/schedule-overview-server";
import {DashboardView,DashboardNext,DashboardUpcoming,DashboardPersonal} from "@/components/dashboard/dashboard-view";
import {loadRanking} from "@/lib/ranking-server";
import {canAdminister} from "@/lib/auth/account-access";
type SchedulesResult = {data:Awaited<ReturnType<typeof loadUpcomingSchedules>>;error:boolean};
async function ScheduleSection({result,now,upcoming=false}:{result:Promise<SchedulesResult>;now:string;upcoming?:boolean}) {
 const {data,error}=await result;
 return upcoming?<DashboardUpcoming schedules={data} now={now} scheduleError={error}/>:<DashboardNext schedules={data} now={now} scheduleError={error}/>;
}
async function PersonalSection({result}:{result:Promise<Awaited<ReturnType<typeof loadRanking>>|null>}) {
 const data=await result;
 return <DashboardPersonal activity={data?.personalActivity} activityError={!data}/>;
}
const pending=(className:string)=><section className={className}><p role="status" className="dashboard-empty-inline">정보를 불러오는 중입니다…</p></section>;
export default async function DashboardPage() {
 const profile=await getCurrentProfile();if(!profile)redirect("/login");
 const now=new Date().toISOString();
 // Start both immediately; schedule content must not wait for the full crew ranking.
 const schedules=measure("page.dashboard.schedules",()=>loadUpcomingSchedules(now,false)).then(data=>({data,error:false}),()=>({data:[],error:true}));
 const activity=measure("page.dashboard.activity",()=>loadRanking(undefined,canAdminister(profile),profile.user_id)).catch(()=>null);
 return <DashboardView profile={profile} now={now} schedules={[]}
  mySection={<Suspense fallback={pending("dashboard-next")}><MyNextSchedule userId={profile.user_id} now={now}/></Suspense>}
  nextSection={<Suspense fallback={pending("dashboard-next")}><ScheduleSection result={schedules} now={now}/></Suspense>}
  personalSection={<Suspense fallback={pending("dashboard-personal")}><PersonalSection result={activity}/></Suspense>}
  upcomingSection={<Suspense fallback={pending("dashboard-upcoming")}><ScheduleSection result={schedules} now={now} upcoming/></Suspense>}/>;
}
