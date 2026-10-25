import Link from "next/link";
import {Icon} from "@/components/ui/icon";
import {scheduleTypeLabels,scheduleStatusLabels} from "@/lib/schedule-labels";
import {scheduleProgress,type ScheduleSummary} from '@/lib/schedule-overview';
export type {ScheduleSummary} from '@/lib/schedule-overview';

export function ScheduleCard({schedule,now,featured=false,joined=false}:{schedule:ScheduleSummary;now:string;featured?:boolean;joined?:boolean}){
 const date=new Date(schedule.start_at),zone='Asia/Seoul';
 const progress=scheduleProgress(schedule,now);
 const status=progress==='종료'||progress==='취소'?progress:schedule.status==='open'&&Date.parse(schedule.registration_end_at)<Date.parse(now)?'모집 마감':scheduleStatusLabels[schedule.status]??schedule.status;
 const dateText=date.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:zone});
 const startText=date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone});
 const deadline= new Date(schedule.registration_end_at).toLocaleString('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone});
 const badges=<div className="flex flex-wrap items-center gap-2">{joined&&<span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">내 신청 완료</span>}<span className={`run-badge type-${schedule.schedule_type}`}>{scheduleTypeLabels[schedule.schedule_type]??schedule.schedule_type}</span><span className={`schedule-status ${status==='모집 중'?'is-open':''}`}><i/>{status}</span>{!['종료','취소'].includes(progress)&&<span className="schedule-progress">{progress==='진행 중'?'진행 중 · 미종료':'시작 전 · 미종료'}</span>}</div>;
 const dateBlock=<div className="schedule-date" aria-label={dateText}><small>{date.toLocaleDateString('ko-KR',{month:'numeric',timeZone:zone}).replace(/\D/g,'')}월</small><strong>{date.toLocaleDateString('ko-KR',{day:'2-digit',timeZone:zone}).replace(/\D/g,'')}</strong><span>{date.toLocaleDateString('ko-KR',{weekday:'short',timeZone:zone})}</span></div>;
 const meta=<div className="schedule-meta"><span><Icon name="calendar" size={15}/>{dateText}</span><span><Icon name="clock" size={15}/>시작 {startText}</span><span><Icon name="pin" size={15}/>{schedule.location}</span></div>;
 return <Link href={`/schedules/${schedule.schedule_id}`} className={featured?'schedule-card featured-event':'schedule-card'}>
  {featured&&<h2>{schedule.title}</h2>}{dateBlock}
  <div className="schedule-card-content">{!featured&&badges}{!featured&&<h2>{schedule.title}</h2>}{meta}{featured&&<div className="featured-status">{badges}</div>}{!featured&&<><p className="schedule-deadline">신청 마감 {deadline}</p>{schedule.capacity!==null&&<p className="schedule-deadline">정원 {schedule.capacity}명</p>}</>}</div>
  {featured&&<div className="featured-registration"><p>신청 마감 {deadline}</p>{schedule.capacity!==null&&<p>정원 {schedule.capacity}명</p>}</div>}
  <span className="schedule-card-arrow">{featured&&<span>{progress==='취소'?'취소된 일정 확인':'일정 상세 확인'}</span>}<Icon name="arrow"/></span>
 </Link>;
}
