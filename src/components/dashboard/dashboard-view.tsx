import Link from "next/link";
import {selectUpcomingSchedules} from "@/lib/schedule-overview";
import {Icon} from "@/components/ui/icon";
import {ScheduleCard,type ScheduleSummary} from "@/components/schedules/schedule-card";
import {canAdminister,canStartActivity} from "@/lib/auth/account-access";
import type {CurrentProfile} from "@/lib/auth/current-user";
import type {PersonalActivity} from "@/lib/personal-activity";

export function DashboardView({profile,schedules,now,scheduleError=false,activity=null,activityError=false}:{profile:CurrentProfile;schedules:ScheduleSummary[];now:string;scheduleError?:boolean;activity?:PersonalActivity|null;activityError?:boolean}) {
  schedules=selectUpcomingSchedules(schedules,now,false);
  const role=profile.role==='admin'?'관리자':profile.staff_position==='president'?'회장':profile.staff_position==='vice_president'?'부회장':profile.role==='staff'?'운영진':profile.role==='guest'?'게스트':'회원';
  const approval=profile.approval_status==='approved'?'승인 완료':'승인 대기';
  const canOperate=canStartActivity(profile)&&['staff','admin'].includes(profile.role);
  return <main className="dashboard-page">
    <header className="dashboard-intro crew-intro">
      <div className="crew-intro-top"><span className="crew-eyebrow"><span aria-hidden="true"/>2001 RUNNERS CLUB</span><span className="crew-edition">{new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Seoul'}).format(new Date(now))}</span></div>
      <div className="crew-intro-content"><div><p className="crew-manifesto">WE RUN<br/><span>AS ONE.</span></p><h1>오늘도, 함께 달려요.</h1><p className="crew-greeting">{profile.nickname||profile.name}님, 다음 러닝과 나의 기록을 만나보세요.</p><Link href="/schedules" className="crew-intro-action">러닝 일정 보기<Icon name="arrow" size={18}/></Link></div><div className="crew-track" aria-hidden="true"><span>01</span><small>KEEP YOUR PACE.</small></div></div>
      <div className="crew-intro-bottom"><span>각자의 속도로, 같은 방향으로.</span><div className="dashboard-account-state"><span>{role}</span><span>{approval}</span></div></div>
    </header>
    {profile.account_status==='restricted'&&<p className="service-notice">신규 활동이 제한된 계정입니다. 일정 조회·기존 참가 취소·출석 인증은 이용할 수 있습니다.</p>}
    <section className="dashboard-next" aria-labelledby="next-run-title">
      <div className="dashboard-section-heading"><h2 id="next-run-title">다음 러닝</h2></div>
      {scheduleError?<div className="dashboard-empty" role="status"><h3>일정을 불러오지 못했어요.</h3><p>잠시 후 다시 확인해 주세요.</p><Link href="/schedules" className="text-link">일정에서 다시 확인<Icon name="arrow" size={16}/></Link></div>:schedules[0]?<ScheduleCard schedule={schedules[0]} now={now} featured/>:<div className="dashboard-empty"><h3>예정된 러닝이 없어요.</h3><p>새 일정이 등록되면 여기에서 확인할 수 있어요.</p><Link href="/schedules" className="text-link">전체 일정 보기<Icon name="arrow" size={16}/></Link></div>}
    </section>
    <section className="dashboard-personal" aria-labelledby="personal-title">
      <div className="dashboard-section-heading"><h2 id="personal-title">내 활동 현황</h2><span className="dashboard-season">{activity?.seasonName??'활동 기록'}</span></div>
      {activityError?<p className="dashboard-empty-inline" role="status">활동 기록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>:<div className="personal-activity-summary"><dl className="personal-ranking"><div><dt>내 순위</dt><dd className={activity?.rank==null?'is-empty':undefined}>{activity?.rank??'미집계'}{activity?.rank!=null&&<small>위</small>}</dd></div><div><dt>활동 점수</dt><dd className={activity?.score==null?'is-empty':undefined}>{activity?.score??'미집계'}{activity?.score!=null&&<small>점</small>}</dd></div><div><dt>출석률</dt><dd className={activity?.attendanceRate==null?'is-empty':undefined}>{activity?.attendanceRate??'미집계'}{activity?.attendanceRate!=null&&<small>%</small>}</dd></div></dl><dl className="personal-attendance"><div><dt>출석</dt><dd>{activity?.attended??0}회</dd></div><div><dt>지각</dt><dd>{activity?.late??0}회</dd></div><div><dt>불참</dt><dd>{activity?.absent??0}회</dd></div></dl>{activity?.rank==null&&<p className="personal-ranking-note">{activity?.total?'현재 랭킹 조건에 따라 순위에 집계되지 않았어요.':'아직 집계된 활동 기록이 없어요.'}</p>}</div>}
    </section>
    <section className="dashboard-upcoming" aria-labelledby="upcoming-title">
      <div className="dashboard-section-heading"><h2 id="upcoming-title">다가오는 일정</h2><Link href="/schedules" className="text-link">전체 보기<Icon name="chevron" size={15}/></Link></div>
      {schedules.length>1?schedules.slice(1).map(schedule=><ScheduleCard key={schedule.schedule_id} schedule={schedule} now={now}/>):<p className="dashboard-empty-inline">{scheduleError?'일정 메뉴에서 다시 확인해 주세요.':'추가로 예정된 일정이 없어요.'}</p>}
    </section>
    <section className="dashboard-activities dashboard-desktop-only" aria-labelledby="activities-title">
      <div className="dashboard-section-heading"><h2 id="activities-title">크루 활동</h2></div>
      <Link href="/leaderboard" className="dashboard-activity"><Icon name="trophy" size={22}/><div><h3>활동 랭킹</h3><p>이번 시즌의 출석과 활동 점수</p></div><Icon name="chevron" size={18}/></Link>
      <Link href="/tracking" className="dashboard-activity"><Icon name="route" size={22}/><div><h3>선수 추적</h3><p>대회에 참가한 크루의 예상 위치</p></div><Icon name="chevron" size={18}/></Link>
      <Link href="/profile" className="dashboard-activity"><Icon name="user" size={22}/><div><h3>내 정보</h3><p>프로필과 계정 관리</p></div><Icon name="chevron" size={18}/></Link>
    </section>
    {canOperate&&<nav className="dashboard-operations" aria-label="크루 운영"><h2>크루 운영</h2><div className="dashboard-operation-links"><Link href="/staff/members/pending">가입 승인<Icon name="chevron" size={16}/></Link><Link href="/admin">{canAdminister(profile)?"크루 관리":"회원 조회"}<Icon name="chevron" size={16}/></Link></div></nav>}
  </main>;
}
