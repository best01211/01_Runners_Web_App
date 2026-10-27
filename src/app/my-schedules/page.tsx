import {participationGroupLabel} from "@/lib/participation-groups";
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentPageProfile} from '@/lib/auth/current-user';
import {canUseService} from '@/lib/auth/account-access';
import {loadMySchedules,upcomingMine} from '@/lib/member-journey-server';
import {attendanceLabels} from '@/lib/member-directory';
export const metadata={title:'내 신청 일정 | 2001 Runners'};
export default async function Page(){
 const p=await getCurrentPageProfile();if(!p||!canUseService(p))redirect('/login');
 const now=new Date().toISOString();let rows;
 try{rows=upcomingMine(await loadMySchedules(p.user_id),now);}catch{return <main><h1>내 신청 일정</h1><p>일정을 불러오지 못했습니다.</p><Link href="/my-schedules">다시 시도</Link></main>;}
 return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6"><h1 className="text-2xl font-bold">내 신청 일정</h1><p>내가 참가 신청한 예정 일정입니다. 출석과 신청 변경은 각 일정에서 할 수 있어요.</p><div className="flex flex-wrap gap-3"><Link className="button-secondary" href="/schedules">전체 일정</Link><Link className="button-secondary" href="/activity">내 활동 내역</Link><Link className="button-secondary" href="/notifications">변경·답글 알림</Link></div>{rows.map(s=><article key={s.schedule_id} className="space-y-3 rounded-2xl border bg-white p-5"><Link className="text-lg font-bold" href={`/schedules/${s.schedule_id}`}>{s.title}</Link><p>{new Date(s.start_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p><p className="my-schedule-group">{s.paceGroup?`내 그룹 · ${participationGroupLabel(s.paceGroup)}`:s.schedule_type!=="event"?"자유 참가 · 그룹 미지정":`참석 유형 · ${{runner:"주자",cheer:"응원단",attendee:"참석"}[s.eventRole??""]??"참석"}`}</p><p className="text-sm">신청 완료{s.eventRole?` · ${{runner:'주자',cheer:'응원단',attendee:'참석'}[s.eventRole]??s.eventRole}`:''} · 출석 {attendanceLabels[s.attendanceStatus??'']??'시작 전'}</p>{s.cancellationDeadline&&<p className="text-sm">취소 가능 기한: {new Date(s.cancellationDeadline).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}<div className="flex flex-wrap gap-2"><Link className="button-primary" href={`/schedules/${s.schedule_id}#attendance`}>출석·신청 확인</Link></div></article>)}{!rows.length&&<p className="rounded-xl border p-5">신청한 예정 일정이 없어요. 전체 일정에서 참여할 러닝을 찾아보세요.</p>}</main>;
}
