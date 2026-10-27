"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Icon} from '@/components/ui/icon';
import type {MySchedule} from '@/lib/member-journey-server';
import {participationGroupLabel} from '@/lib/participation-groups';
import {attendancePresentation} from '@/lib/attendance-presentation';
const when=(value:string)=>new Date(value).toLocaleString('ko-KR',{month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
export function MyScheduleCard({schedule,today=false,additional=0,error=false,now:initialNow}:{now?:string;schedule:MySchedule|null;today?:boolean;additional?:number;error?:boolean}){
 const [status,setStatus]=useState(schedule?.attendanceStatus??null),[opened,setOpened]=useState(Boolean(schedule?.attendanceOpenedAt)),[closed,setClosed]=useState(Boolean(schedule?.attendanceClosedAt)),[now,setNow]=useState(()=>initialNow?Date.parse(initialNow):Date.now()),[refreshFailed,setRefreshFailed]=useState(false);
 useEffect(()=>{
  if(!schedule||!today)return;
  let alive=true;const controller=new AbortController();const anchor=Date.now(),base=initialNow?Date.parse(initialNow):anchor;
  async function load(){if(document.visibilityState!=="visible")return;setNow(base+Date.now()-anchor);
   try{const response=await fetch(`/api/schedules/${schedule!.schedule_id}/attendance`,{cache:"no-store",signal:controller.signal});const result=await response.json();if(!response.ok||!result.success)throw Error();
    if(alive){const own=result.data.attendance.find((row:{user_id:string})=>row.user_id===schedule!.userId);setStatus(own?.status??null);setOpened(result.data.attendanceOpen);setClosed(result.data.attendanceClosed);setRefreshFailed(false);}
   }catch{if(alive)setRefreshFailed(true);}
  }
  void load();const timer=setInterval(()=>void load(),15000);document.addEventListener("visibilitychange",load);
  return()=>{alive=false;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",load);};
 },[schedule,today,initialNow]);
 const state=schedule?attendancePresentation({startAt:schedule.start_at,status,opened,closed,now,today}):null;
 return <section className={`home-focus${error?" home-focus-error":""}`} aria-label="내 신청 일정"><div className="home-focus-content"><div className="home-focus-heading"><h2>{error?'내 신청 일정':today?'오늘의 러닝':'내 다음 러닝'}</h2>{schedule&&<span>{refreshFailed?'상태 확인 필요':state?.label}</span>}</div>
 {error?<><h3>내 일정을 불러오지 못했어요.</h3><Link className="button-secondary" href="/my-schedules">다시 확인하기</Link></>:schedule?<><h3><Link href={`/schedules/${schedule.schedule_id}`}>{schedule.title}</Link></h3><p className="home-focus-time">{when(schedule.start_at)}</p><p className="home-focus-place">{schedule.location}</p>{schedule.paceGroup&&<p className="home-my-group">내 그룹 · {participationGroupLabel(schedule.paceGroup)}</p>}{today&&<p className="home-attendance-note" role="status">{refreshFailed?'최신 출석 상태를 확인하지 못했습니다. 일정 상세에서 확인해주세요.':state?.description}</p>}<Link className="button-primary" href={`/schedules/${schedule.schedule_id}${refreshFailed?'':state?.anchor??''}`}>{refreshFailed?'오늘 일정 확인':state?.action}<Icon name="arrow" size={17}/></Link>{additional>0&&<Link className="home-additional" href="/my-schedules">{today?'오늘 신청한':'신청한'} 다른 일정 {additional}개 →</Link>}</>:<><h3>다음 러닝을 골라볼까요?</h3><p className="home-focus-place">아직 신청한 예정 일정이 없어요.</p><Link className="button-primary" href="/schedules">러닝 일정 보기<Icon name="arrow" size={17}/></Link></>}
 </div><div className="home-focus-footer" aria-hidden="true"><span>WE RUN AS ONE.</span><span>각자의 속도로, 함께.</span></div></section>;
}
