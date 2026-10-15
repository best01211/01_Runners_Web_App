import Link from "next/link";
import {Icon} from "@/components/ui/icon";
import {scheduleTypeLabels,scheduleStatusLabels} from "@/lib/schedule-labels";

export type ScheduleSummary={schedule_id:string;title:string;schedule_type:string;status:string;location:string;start_at:string;registration_end_at:string;capacity:number|null};
export function ScheduleCard({schedule,now,featured=false}:{schedule:ScheduleSummary;now:string;featured?:boolean}) {
  const date=new Date(schedule.start_at);
  const day=date.toLocaleDateString('ko-KR',{day:'2-digit',timeZone:'Asia/Seoul'}).replace(/\D/g,'');
  const month=date.toLocaleDateString('en-US',{month:'short',timeZone:'Asia/Seoul'}).toUpperCase();
  const status=schedule.status==='open'&&Date.parse(schedule.registration_end_at)<Date.parse(now)?'모집 마감':scheduleStatusLabels[schedule.status]??schedule.status;
  return <Link href={`/schedules/${schedule.schedule_id}`} className={featured?"schedule-card featured-event":"schedule-card"}>
    <div className="schedule-date"><small>{featured?`${date.toLocaleDateString('ko-KR',{month:'numeric',timeZone:'Asia/Seoul'}).replace(/\D/g,'')}월`:month}</small><strong>{day}</strong><span>{date.toLocaleDateString('ko-KR',{weekday:'short',timeZone:'Asia/Seoul'})}{!featured&&` · ${date.toLocaleDateString('en-US',{year:'numeric',timeZone:'Asia/Seoul'})}`}</span></div>
    <div className="schedule-card-content"><div className="flex flex-wrap items-center gap-2"><span className={`run-badge type-${schedule.schedule_type}`}>{scheduleTypeLabels[schedule.schedule_type]??schedule.schedule_type}</span><span className={`schedule-status ${status==='모집 중'?'is-open':''}`}><i/>{status}</span></div><h2>{schedule.title}</h2><div className="schedule-meta"><span><Icon name="clock" size={15}/>{date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</span><span><Icon name="pin" size={15}/>{schedule.location}</span>{schedule.capacity!==null&&<span><Icon name="users" size={15}/>정원 {schedule.capacity}명</span>}</div><p className="schedule-deadline">신청 마감 {new Date(schedule.registration_end_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</p></div>
    <span className="schedule-card-arrow">{featured&&<span>일정 보기</span>}<Icon name="arrow"/></span>
  </Link>;
}
