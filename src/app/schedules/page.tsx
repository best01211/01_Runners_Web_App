import {ScheduleCard} from "@/components/schedules/schedule-card";
import {ScheduleCalendar} from '@/components/schedules/schedule-calendar';
import {Icon} from "@/components/ui/icon";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentPageProfile as getCurrentProfile,isStaffOrAdmin,canStartActivity} from "@/lib/auth/current-user";
import {loadAllUpcomingSchedules,loadScheduleHistoryOrMonth} from '@/lib/schedule-overview-server';
import {loadMySchedules} from '@/lib/member-journey-server';
import {koreaDay} from '@/lib/schedule-overview';
import {scheduleTypeLabels} from '@/lib/schedule-labels';

export default async function SchedulesPage({searchParams}:{searchParams:Promise<{view?:string;month?:string;type?:string;day?:string}>}){
 const profile=await getCurrentProfile();if(!profile)redirect('/login');
 const params=await searchParams,now=new Date().toISOString(),past=params.view==='past',calendar=params.view==='calendar';
 const month=params.month&&/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(params.month)?params.month:koreaDay(now).slice(0,7);
 const type=params.type&&Object.hasOwn(scheduleTypeLabels,params.type)?params.type:'all';
 const selectedDay=params.day&&params.day.startsWith(month+'-')&&/^\d{4}-\d{2}-\d{2}$/.test(params.day)&&Number.isFinite(Date.parse(params.day))&&new Date(params.day).toISOString().slice(0,10)===params.day?params.day:undefined;
 const [rows,mine]=await Promise.all([calendar?loadScheduleHistoryOrMonth(now,month):past?loadScheduleHistoryOrMonth(now):loadAllUpcomingSchedules(now),loadMySchedules(profile.user_id).catch(()=>null)]);
 const joined=new Set(mine?.map(s=>s.schedule_id)??[]);
 const schedules=rows.filter(s=>type==='all'||s.schedule_type===type);
 const canCreate=canStartActivity(profile)&&['member','staff','admin'].includes(profile.role);
 const href=(view:string,t=type)=>`/schedules?view=${view}&type=${t}${view==='calendar'?`&month=${month}`:''}`;
 return <main><header className="page-heading"><div><p className="eyebrow">2001 RUNNERS</p><h1>러닝 일정</h1><p className="page-description">정기런·훈련·이벤트·번개런을 목록과 캘린더로 확인하세요.</p></div><div className="flex flex-wrap gap-2">{isStaffOrAdmin(profile)&&<Link href="/admin?tab=templates" className="button-secondary">정기런 양식 관리</Link>}{canCreate&&<Link data-maintenance-blocked={Boolean(profile.service_blocked?.scheduleCreation)} href="/schedules/new" className="button-primary"><Icon name="plus" size={16}/>일정 만들기</Link>}</div></header>
 <div className="schedules-toolbar"><nav aria-label="일정 보기" className="segmented-tabs"><Link href={href('upcoming')} aria-current={!past&&!calendar?'page':undefined}>다가오는 일정</Link><Link href={href('past')} aria-current={past?'page':undefined}>지난 일정</Link><Link href={href('calendar')} aria-current={calendar?'page':undefined}>캘린더</Link></nav><span className="list-count">총 {schedules.length}개의 일정</span></div>
 <nav aria-label="러닝 유형" className="management-tabs mb-4">{[['all','전체'],...Object.entries(scheduleTypeLabels)].map(([key,label])=><Link key={key} href={href(calendar?'calendar':past?'past':'upcoming',key)} aria-current={type===key?'page':undefined}>{label}</Link>)}</nav>
 <div className="mb-4 flex flex-wrap gap-3"><Link href="/my-schedules" className="button-secondary">내 신청 일정</Link><Link href="/activity" className="button-secondary">내 출석·활동 내역</Link><Link href="/notifications" className="button-secondary">일정 변경 알림</Link></div>
 {!past&&!calendar&&<p className="mb-4 text-sm text-zinc-500">등록된 모든 예정 일정을 시간순으로 보여드려요. 위에서 유형을 선택해 찾을 수 있습니다.</p>}
 {mine===null&&<p role="status">내 신청 여부를 불러오지 못했어요. 내 신청 일정에서 다시 확인해주세요.</p>}
 {calendar?<ScheduleCalendar key={`${month}-${type}`} month={month} schedules={schedules} now={now} type={type} selectedDay={selectedDay}/>:<section className="schedule-list">{schedules.length?schedules.map(s=><ScheduleCard key={s.schedule_id} schedule={s} now={now} joined={joined.has(s.schedule_id)}/>):<div className="empty-state"><span className="empty-icon"><Icon name="calendar" size={28}/></span><h3>{past?'지난 일정이 없습니다':'다가오는 일정이 없습니다'}</h3><p>선택한 유형의 다른 일정은 캘린더에서 확인해 주세요.</p></div>}</section>}
 </main>;
}
