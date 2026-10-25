import Link from 'next/link';
import {koreaDay} from '@/lib/schedule-overview';
import {loadMySchedules,upcomingMine} from '@/lib/member-journey-server';
import {attendanceLabels} from '@/lib/member-directory';
export async function MyNextSchedule({userId,now}:{userId:string;now:string}){
 const loaded=await loadMySchedules(userId).catch(()=>null);
 if(!loaded)return <section className="rounded-xl border p-4"><p>내 신청 일정을 불러오지 못했어요.</p><Link className="text-link" href="/my-schedules">내 일정에서 다시 확인 →</Link></section>;
  const rows=upcomingMine(loaded,now),today=rows.filter(s=>koreaDay(s.start_at)===koreaDay(now));
  const next=today.length?today:rows.slice(0,1);
  return <section aria-label="내 신청 일정" className="rounded-2xl border border-emerald-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{today.length?'오늘 내가 신청한 일정':'내 다음 러닝'}</h2><Link className="text-link" href="/my-schedules">내 신청 전체 보기 →</Link></div>{next.length?next.map(s=><div key={s.schedule_id} className="mt-4 space-y-3"><Link href={`/schedules/${s.schedule_id}`} className="text-lg font-bold">{s.title}</Link><p className="text-sm">{new Date(s.start_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 신청 완료</p><p className="text-sm">내 출석: {attendanceLabels[s.attendanceStatus??'']??'출석 시작 전'}</p><div className="flex flex-wrap gap-2"><Link className="button-primary" href={`/schedules/${s.schedule_id}#attendance`}>{today.length?'오늘 출석하기':'신청 정보 보기'}</Link><a className="button-secondary" href={`/api/schedules/${s.schedule_id}/calendar`}>내 캘린더에 저장</a></div></div>):<div className="mt-4"><p>아직 신청한 일정이 없어요.</p><Link href="/schedules" className="text-link">전체 일정에서 첫 러닝 신청하기 →</Link></div>}<Link href="/activity" className="mt-4 inline-block text-sm underline">내 출석·활동 내역</Link></section>;
}
