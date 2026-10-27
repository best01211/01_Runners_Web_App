import {koreaDay} from '@/lib/schedule-overview';
import {loadMySchedules,upcomingMine} from '@/lib/member-journey-server';
import {MyScheduleCard} from './dashboard-view';
export async function MyNextSchedule({userId,now}:{userId:string;now:string}){
 const loaded=await loadMySchedules(userId).catch(()=>null);
 if(!loaded)return <MyScheduleCard schedule={null} error/>;
 const rows=upcomingMine(loaded,now),today=rows.filter(s=>koreaDay(s.start_at)===koreaDay(now));
 const focus=today.length?today:rows;
 return <MyScheduleCard key={focus[0]?.schedule_id} now={now} schedule={focus[0]??null} today={today.length>0} additional={Math.max(0,focus.length-1)}/>;
}
