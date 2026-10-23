import {myResultSource,parseTimingEvent,TimingError} from './myresult';
export function timingCredentials(eventId:string){
 const key=process.env[`MYRESULT_API_KEY_${eventId}`]??process.env.MYRESULT_API_KEY;
 const header=process.env.MYRESULT_API_KEY_HEADER;
 if(!key||!header||!/^[A-Za-z0-9-]{1,60}$/.test(header)||/[\r\n]/.test(key))return null;
 return {[header]:key};
}
export async function fetchTimingJSON(url:string,headers:Record<string,string>={},request:typeof fetch=fetch){
 const parsed=new URL(url);
 if(parsed.origin!=='https://myresult.co.kr'||!/^\/api\/event\/[1-9]\d{0,8}(?:\/player\/[A-Za-z0-9-]{1,20})?$/.test(parsed.pathname)||parsed.search||parsed.hash)throw new TimingError('INVALID_SOURCE','허용되지 않은 기록 주소입니다.');
 const response=await request(url,{headers:{Accept:'application/json',...headers},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
 if(response.status===401||response.status===403)throw new TimingError('AUTH_REQUIRED','MyResult API 인증 설정이 필요합니다.');
 if(response.status===404)throw new TimingError('NOT_FOUND','대회 또는 배번호 기록을 찾을 수 없습니다.');
 if(response.status===429)throw new TimingError('RATE_LIMIT','기록 제공처의 요청 제한으로 잠시 대기합니다.');
 if(!response.ok)throw new TimingError('UPSTREAM_ERROR','기록 제공처 연결이 지연됩니다.');
 if(!response.headers.get('content-type')?.includes('application/json'))throw new TimingError('INVALID_RESPONSE','기록 제공처가 JSON을 반환하지 않았습니다.');
 if(Number(response.headers.get('content-length'))>1000000)throw new TimingError('TOO_LARGE','기록 응답 크기가 너무 큽니다.');
 const reader=response.body?.getReader();if(!reader)throw new TimingError('INVALID_RESPONSE','기록 응답이 없습니다.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000)throw new TimingError('TOO_LARGE','기록 응답 크기가 너무 큽니다.');chunks.push(value);}}finally{await reader.cancel();}
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(data)) as unknown;}catch{throw new TimingError('INVALID_RESPONSE','기록 JSON을 읽지 못했습니다.');}
}
export async function inspectTimingSource(url:string){const source=myResultSource(url);return parseTimingEvent(await fetchTimingJSON(source.api),source.id);}
