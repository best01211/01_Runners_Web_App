'use client';
import Link from 'next/link';
import {useState} from 'react';
import {ScheduleCard} from './schedule-card';
import {koreaDay,type ScheduleSummary} from '@/lib/schedule-overview';
import {scheduleTypeLabels} from '@/lib/schedule-labels';

export function ScheduleCalendar({month,schedules,now,type='all',selectedDay}:{month:string;schedules:ScheduleSummary[];now:string;type?:string;selectedDay?:string}){
 const today=koreaDay(now),[selected,setSelected]=useState(selectedDay??(today.startsWith(month)?today:schedules[0]?koreaDay(schedules[0].start_at):`${month}-01`));
 const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)).getUTCDay(),days=new Date(Date.UTC(year,m,0)).getUTCDate();
 const navigate=(delta:number)=>{const value=new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);return `/schedules?view=calendar&month=${value}&type=${type}`;};
 const own=schedules.filter(s=>koreaDay(s.start_at)===selected);
 return <section aria-label="월별 일정 캘린더"><div className="calendar-heading"><Link href={navigate(-1)} className="button-secondary" aria-label="이전 달">←</Link><h2>{year}년 {m}월</h2><Link href={navigate(1)} className="button-secondary" aria-label="다음 달">→</Link><Link href={`/schedules?view=calendar&month=${today.slice(0,7)}&type=${type}`} className="text-link">이번 달</Link></div>
 <div className="schedule-calendar"><div className="calendar-weekdays" aria-hidden="true">{['일','월','화','수','목','금','토'].map(d=><span key={d}>{d}</span>)}</div><div className="calendar-days">{Array.from({length:first},(_,i)=><span key={`empty-${i}`} aria-hidden="true"/>)}{Array.from({length:days},(_,i)=>{
  const day=`${month}-${String(i+1).padStart(2,'0')}`,items=schedules.filter(s=>koreaDay(s.start_at)===day),types=[...new Set(items.map(s=>s.schedule_type))];
  return <button key={day} type="button" aria-label={`${m}월 ${i+1}일, 일정 ${items.length}개${today===day?', 오늘':''}`} aria-pressed={selected===day} aria-current={today===day?'date':undefined} onClick={()=>{setSelected(day);const url=new URL(window.location.href);url.searchParams.set('day',day);window.history.replaceState(window.history.state,'',url);}}><span>{i+1}</span><span className="calendar-markers" aria-hidden="true">{types.map(t=><i className={`type-${t}`} key={t}/>)}</span>{items.length>0&&<small>{items.length}개</small>}</button>;
 })}</div></div><div className="calendar-legend">{Object.entries(scheduleTypeLabels).map(([key,label])=><span key={key}><i className={`type-${key}`}/>{label}</span>)}</div>
 <section className="mt-6" aria-live="polite"><h3 className="font-bold">{selected.replaceAll('-','.')} 일정 <span className="text-zinc-500">{own.length}개</span></h3><div className="schedule-list">{own.length?own.map(s=><ScheduleCard key={s.schedule_id} schedule={s} now={now}/>):<p className="py-8 text-sm text-zinc-500">선택한 날짜에 등록된 일정이 없습니다.</p>}</div></section>
 </section>;
}
