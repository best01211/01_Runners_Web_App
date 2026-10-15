export type ScheduleSummary={schedule_id:string;title:string;schedule_type:string;status:string;location:string;start_at:string;end_at?:string|null;registration_end_at:string;capacity:number|null};
export const scheduleFields='schedule_id,title,schedule_type,status,location,start_at,end_at,registration_end_at,capacity';
export function koreaDay(value:string){return new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10);}
export function monthRange(month:string){
 const [year,m]=month.split('-').map(Number);
 return {start:new Date(Date.UTC(year,m-1,1)-9*3600000).toISOString(),end:new Date(Date.UTC(year,m,1)-9*3600000).toISOString()};
}
export function nextMonthAt(value:string){
 const d=new Date(Date.parse(value)+9*3600000),day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));
 return new Date(d.getTime()-9*3600000).toISOString();
}
export function selectUpcomingSchedules(rows:ScheduleSummary[],now:string,includeFlash=true){
 const current=Date.parse(now),until=Date.parse(nextMonthAt(now)),seen=new Set<string>();
 return [...rows].sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at)||a.schedule_id.localeCompare(b.schedule_id)).filter(s=>{
  if(['completed','cancelled'].includes(s.status)||Date.parse(s.end_at??s.start_at)<current)return false;
  if(['regular','training'].includes(s.schedule_type)){if(seen.has(s.schedule_type))return false;seen.add(s.schedule_type);return true;}
  return (s.schedule_type==='event'||(includeFlash&&s.schedule_type==='flash'))&&Date.parse(s.start_at)<=until;
 });
}
export function scheduleProgress(schedule:ScheduleSummary,now:string){
 if(schedule.status==='cancelled')return '취소';
 if(schedule.status==='completed'||(schedule.end_at&&Date.parse(schedule.end_at)<=Date.parse(now)))return '종료';
 return Date.parse(schedule.start_at)<=Date.parse(now)?'진행 중':'시작 전';
}
