'use client';
import {useState} from 'react';
import {Icon} from '@/components/ui/icon';
export function CopyScheduleLink({scheduleId}:{scheduleId:string}){
 const [state,setState]=useState<'idle'|'copying'|'copied'|'failed'>('idle'),[url,setUrl]=useState('');
 async function copy(){
  if(state==='copying')return;
  const link=new URL('/schedules/'+encodeURIComponent(scheduleId),window.location.origin).href;setUrl(link);setState('copying');
  try{await navigator.clipboard.writeText(link);setState('copied');}catch{setState('failed');}
 }
 return <div className="schedule-share"><button type="button" className="schedule-share-button button-secondary" disabled={state==='copying'} onClick={()=>void copy()}><Icon name="link" size={16}/>{state==='copied'?'링크 복사 완료':state==='copying'?'복사 중…':'일정 공유'}</button><span role="status" className="sr-only">{state==='copied'?'일정 링크를 클립보드에 복사했습니다.':''}</span>{state==='failed'&&<label className="schedule-share-fallback">자동 복사가 안 돼요. 아래 주소를 직접 복사해주세요.<input aria-label="공유할 일정 주소" readOnly value={url} onFocus={e=>e.currentTarget.select()} className="input mt-2"/></label>}</div>;
}
