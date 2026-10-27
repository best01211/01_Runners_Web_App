import type {ReactNode} from 'react';
import Link from 'next/link';
import {Icon} from '@/components/ui/icon';
import {canAdminister,canStartActivity} from '@/lib/auth/account-access';
import type {CurrentProfile} from '@/lib/auth/current-user';
import type {ScheduleSummary} from '@/lib/schedule-overview';
import {scheduleTypeLabels,scheduleStatusLabels} from '@/lib/schedule-labels';
import {MyScheduleCard} from './my-schedule-card';
export {MyScheduleCard} from './my-schedule-card';

const when=(value:string)=>new Date(value).toLocaleString('ko-KR',{month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
export function DashboardView({profile,schedules,now,scheduleError=false,mySection,upcomingSection}:{profile:CurrentProfile;schedules:ScheduleSummary[];now:string;scheduleError?:boolean;mySection?:ReactNode;upcomingSection?:ReactNode}){
 const canOperate=canStartActivity(profile)&&['staff','admin'].includes(profile.role);
 return <main className="dashboard-page home-simple">
  <header className="home-greeting"><div className="home-edition"><span>2001 RUNNERS</span><p>{new Date(now).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'})}</p></div><h1>{profile.nickname||profile.name}님, 오늘도 함께 달려요.</h1></header>
  {profile.account_status==='restricted'&&<p className="service-notice">신규 활동이 제한된 계정입니다. 기존 참가 취소·출석 인증은 이용할 수 있습니다.</p>}
  {mySection??<MyScheduleCard schedule={null}/>}
  <nav className="home-shortcuts" aria-label="내 활동 바로가기">{[{href:'/my-schedules',label:'내 신청 일정',icon:'calendar'},{href:'/activity',label:'내 출석 내역',icon:'check'},{href:'/notifications',label:'내 알림',icon:'bell'}].map(item=><Link key={item.href} href={item.href}><span className="home-shortcut-icon"><Icon name={item.icon as 'calendar'|'check'|'bell'} size={19}/></span><span>{item.label}</span></Link>)}</nav>
  {upcomingSection??<DashboardUpcoming schedules={schedules} now={now} scheduleError={scheduleError}/>}
  {canOperate&&<details className="home-operations"><summary>크루 운영</summary><nav aria-label="크루 운영"><Link href="/staff/members/pending">가입 승인</Link><Link href="/admin">{canAdminister(profile)?'크루 관리':'회원 조회'}</Link></nav></details>}
 </main>;
}
export function DashboardUpcoming({schedules,now,scheduleError=false}:{schedules:ScheduleSummary[];now:string;scheduleError?:boolean}){
 const rows=schedules.filter(s=>!['cancelled','completed'].includes(s.status)&&Date.parse(s.end_at??s.start_at)>=Date.parse(now)).slice(0,2);
 return <section className="home-upcoming" aria-labelledby="home-upcoming-title"><div className="home-list-heading"><h2 id="home-upcoming-title">다가오는 크루 일정</h2><Link href="/schedules">전체 보기 →</Link></div>{scheduleError?<p className="home-list-empty">일정을 불러오지 못했어요. <Link href="/schedules">다시 확인</Link></p>:rows.length?<div className="home-run-list">{rows.map(s=><Link key={s.schedule_id} href={`/schedules/${s.schedule_id}`} className="home-run-row"><span className="home-run-date"><strong>{new Date(s.start_at).toLocaleDateString('ko-KR',{day:'2-digit',timeZone:'Asia/Seoul'}).replace(/\D/g,'')}</strong><small>{new Date(s.start_at).toLocaleDateString('ko-KR',{month:'numeric',timeZone:'Asia/Seoul'})}</small></span><span className="home-run-info"><small>{scheduleTypeLabels[s.schedule_type]} · {s.status==='open'&&Date.parse(s.registration_end_at)<Date.parse(now)?'모집 마감':scheduleStatusLabels[s.status]??s.status}</small><strong>{s.title}</strong><span>{when(s.start_at)}</span></span><Icon name="chevron" size={17}/></Link>)}</div>:<div className="home-list-empty home-no-runs"><span className="home-empty-icon"><Icon name="calendar" size={23}/></span><div><p>등록된 예정 일정이 없어요.</p><small>새 일정이 등록되면 여기서 확인할 수 있어요.</small></div></div>}</section>;
}
