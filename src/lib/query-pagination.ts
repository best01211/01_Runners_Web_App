/** Fetch past PostgREST's row cap; never return a silently truncated count. */
export async function readAllPages<T>(load:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>,maxRows=5000):Promise<T[]> {
 const rows:T[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await load(offset,offset+499);
  if(error||!data)throw new Error("참가 정보를 불러오지 못했습니다.");
  rows.push(...data);
  if(rows.length>maxRows)throw new Error("참가 인원 조회 한도를 초과했습니다.");
  if(data.length<500)return rows;
 }
}
