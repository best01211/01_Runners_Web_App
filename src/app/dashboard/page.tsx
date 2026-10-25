import {Suspense} from 'react';
import {redirect} from 'next/navigation';
import {getCurrentPageProfile} from '@/lib/auth/current-user';
import {loadUpcomingSchedules} from '@/lib/schedule-overview-server';
import {DashboardView,DashboardUpcoming} from '@/components/dashboard/dashboard-view';
import {MyNextSchedule} from '@/components/dashboard/my-next-schedule';
import {measure} from '@/lib/performance';
type Result={data:Awaited<ReturnType<typeof loadUpcomingSchedules>>;error:boolean};
async function Upcoming({result,now}:{result:Promise<Result>;now:string}){
 const {data,error}=await result;return <DashboardUpcoming schedules={data} now={now} scheduleError={error}/>;
}
export default async function DashboardPage(){
 const profile=await getCurrentPageProfile();if(!profile)redirect('/login');
 const now=new Date().toISOString();
 const schedules=measure('page.dashboard.schedules',()=>loadUpcomingSchedules(now,false)).then(data=>({data,error:false}),()=>({data:[],error:true}));
 return <DashboardView profile={profile} schedules={[]} now={now}
  mySection={<Suspense fallback={<section className="home-focus" aria-busy="true"><p role="status">내 신청 일정을 확인하고 있어요…</p></section>}><MyNextSchedule userId={profile.user_id} now={now}/></Suspense>}
  upcomingSection={<Suspense fallback={<section className="home-upcoming" aria-busy="true"><p role="status">크루 일정을 불러오는 중…</p></section>}><Upcoming result={schedules} now={now}/></Suspense>}/>;
}
