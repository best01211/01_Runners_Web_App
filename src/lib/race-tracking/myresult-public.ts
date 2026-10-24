import {load} from 'cheerio';
import {myResultSource,parseTimingPlayer,TimingError} from './myresult';
import type {TimingEvent} from './myresult';

/** Read only server-rendered public markup; never execute scripts or copy browser credentials. */
export function parsePublicTimingPlayer(html:string,event:TimingEvent,code:string,bib:string,entryId:string,officialDistance:number,startAt:string,now:number){
 const $=load(html);$('script,style,template,noscript').remove();
 const canonical=(v:string)=>/^\d+$/.test(v)?v.replace(/^0+(?=\d)/,''):v;
 const player=$('.card-player');
 const pageBib=player.find('.ant-card-meta-description').text().trim().match(/#([A-Za-z0-9-]{1,20})\s*$/)?.[1];
 const pageCode=player.find('.ant-avatar-string').text().trim();
 const eventCard=$('.ant-card').filter((_,el)=>!$(el).hasClass('card-player')).first();
 const date=eventCard.find('.ant-card-meta-description').text().match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
 const title=eventCard.find('.ant-card-meta-title').text().trim();
 const course=event.courses.find(c=>c.code===code);
 const rows=$('.table-row');
 const headers=$('.table-header').first().children().map((_,el)=>$(el).text().trim()).get();
 if(player.length!==1||!pageBib||canonical(pageBib)!==canonical(bib)||pageCode!==code||date!==event.date||title!==event.name||!course||rows.length===0||rows.length>100||headers[0]!=='구간명'||headers[1]!=='통과시간')throw new TimingError('INVALID_RESPONSE','공개 기록 화면의 대회·종목·배번호 또는 표 형식이 일치하지 않습니다.');
 const records:{point_cd:string;lap:number;time_point:string}[]=[];
 rows.each((_,el)=>{
  const cells=$(el).children().map((_,cell)=>$(cell).text().trim()).get();
  if(cells.length!==4)throw new TimingError('INVALID_RESPONSE','공개 기록 표 형식이 변경되었습니다.');
  const [name,time]=cells;
  if(['?','-',''].includes(time))return;
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(time))throw new TimingError('INVALID_RESPONSE','공개 기록의 통과 시각을 확인해주세요.');
  // Names without an unambiguous official timing point (e.g. 반환점) are never assigned a guessed distance.
  const matches=course.points.filter(p=>p.name.trim()===name);
  if(matches.length!==1)throw new TimingError('INVALID_RESPONSE','공개 기록의 계측 지점을 하나로 확인할 수 없습니다.');
  records.push({point_cd:matches[0].code,lap:matches[0].lap,time_point:time});
 });
 return parseTimingPlayer({event_id:event.id,course_cd:code,num:pageBib,records},event,code,bib,entryId,officialDistance,startAt,now);
}

export async function fetchPublicTimingHTML(eventUrl:string,bib:string,request:typeof fetch=fetch){
 const source=myResultSource(eventUrl);
 if(!/^[A-Za-z0-9-]{1,20}$/.test(bib))throw new TimingError('INVALID_SOURCE','배번호 형식을 확인해주세요.');
 const response=await request(source.url+'/'+encodeURIComponent(bib),{headers:{Accept:'text/html'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4500)});
 if(response.status===429)throw new TimingError('RATE_LIMIT','공개 기록 페이지의 요청 제한으로 잠시 대기합니다.');
 if(response.status===401||response.status===403)throw new TimingError('AUTH_REQUIRED','공개 기록 페이지 접근이 제한되었습니다.');
 if(!response.ok)throw new TimingError('UPSTREAM_ERROR','공개 기록 페이지 연결을 확인해주세요.');
 if(!response.headers.get('content-type')?.includes('text/html'))throw new TimingError('INVALID_RESPONSE','공개 기록 페이지가 HTML을 반환하지 않았습니다.');
 const limit=2000000;
 if(Number(response.headers.get('content-length'))>limit)throw new TimingError('TOO_LARGE','공개 기록 페이지가 너무 큽니다.');
 const reader=response.body?.getReader();if(!reader)throw new TimingError('INVALID_RESPONSE','공개 기록 페이지가 비어 있습니다.');
 const decoder=new TextDecoder();let size=0,html='';
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new TimingError('TOO_LARGE','공개 기록 페이지가 너무 큽니다.');html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel();}
 return html;
}
