type CalendarSchedule={schedule_id:string;title:string;description?:string|null;location:string;start_at:string;end_at?:string|null;status:string};
const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function foldCalendarLine(line:string):string{
 const encoder=new TextEncoder();let result='',size=0;
 for(const character of line){const bytes=encoder.encode(character).length;if(size+bytes>75){result+='\r\n ';size=1;}result+=character;size+=bytes;}
 return result;
}
export function calendarExport(schedule:CalendarSchedule,url:string,now:string):string{
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//2001 Runners//Crew Schedule//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${schedule.schedule_id}@2001runners`,`DTSTAMP:${utc(now)}`,`DTSTART:${utc(schedule.start_at)}`,`DTEND:${utc(schedule.end_at??new Date(Date.parse(schedule.start_at)+3600000).toISOString())}`,`SUMMARY:${escape(schedule.title)}`,`LOCATION:${escape(schedule.location)}`,`DESCRIPTION:${escape(schedule.description??'')}`,`URL:${url}`,`STATUS:${schedule.status==='cancelled'?'CANCELLED':'CONFIRMED'}`,'BEGIN:VALARM','TRIGGER:-PT1H','ACTION:DISPLAY','DESCRIPTION:러닝 일정 1시간 전입니다.','END:VALARM','END:VEVENT','END:VCALENDAR'].map(foldCalendarLine).join('\r\n')+'\r\n';
}
