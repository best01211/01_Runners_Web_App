"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function DeleteCancelledSchedule({scheduleId}:{scheduleId:string}){
 const router=useRouter();const [opened,setOpened]=useState(false),[confirmation,setConfirmation]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function remove(){if(busy||confirmation!=="영구 삭제")return;setBusy(true);setError("");try{
  const response=await fetch(`/api/schedules/${scheduleId}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({permanent:true,confirmation})});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message??"삭제하지 못했습니다.");
  router.replace("/schedules?view=past");router.refresh();
 }catch(e){setError(e instanceof Error?e.message:"삭제하지 못했습니다.");}finally{setBusy(false);}}
 return <section className="mt-4 rounded-xl border border-red-200 p-4"><p>취소 상태로 남겨두거나 영구 삭제할 수 있습니다.</p>{!opened?<div className="mt-3 flex gap-2"><button className="button-secondary" onClick={()=>router.push("/schedules?view=past")}>취소 상태 유지</button><button className="button-secondary text-red-700" onClick={()=>setOpened(true)}>영구 삭제</button></div>:<div className="mt-3 space-y-3"><p className="text-sm text-red-700">일정과 연결된 참가·출석·댓글·일정 추적 기록을 영구 삭제합니다. 복구할 수 없습니다. 정기런 양식과 독립 추적 대회는 유지됩니다.</p><label className="block text-sm">확인을 위해 ‘영구 삭제’를 입력해주세요<input className="input mt-2" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label><button className="button-primary" disabled={busy||confirmation!=="영구 삭제"} onClick={()=>void remove()}>{busy?"삭제 중…":"복구 불가 · 영구 삭제 실행"}</button><button className="button-secondary ml-2" disabled={busy} onClick={()=>{setOpened(false);setConfirmation("");}}>닫기</button>{error&&<p role="alert">{error}</p>}</div>}</section>;
}
