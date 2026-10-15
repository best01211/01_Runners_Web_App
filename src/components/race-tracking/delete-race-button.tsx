"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";

export function DeleteRaceButton({raceId,name,redirectAfter=false}:{raceId:string;name:string;redirectAfter?:boolean}) {
 const router=useRouter();
 const [pending,setPending]=useState(false);
 const [error,setError]=useState("");
 async function remove() {
  if(pending||!window.confirm(`‘${name}’ 이벤트를 삭제할까요?\n삭제하면 추적 목록과 상세 화면에서 더 이상 표시되지 않습니다.`))return;
  setPending(true);setError("");
  try {
   const response=await fetch(`/api/tracking/${raceId}`,{method:"DELETE"});
   const result=await response.json();
   if(!response.ok||!result.success)throw new Error(result.error?.message||"이벤트를 삭제하지 못했습니다.");
   if(redirectAfter)router.replace("/tracking");
   router.refresh();
  } catch(e) {setError(e instanceof Error?e.message:"연결하지 못했습니다. 다시 시도해주세요.");setPending(false);}
 }
 return <div className="flex min-w-0 flex-col items-start gap-2"><button type="button" onClick={remove} disabled={pending} aria-label={`${name} 이벤트 삭제`} className="min-h-11 rounded-[10px] border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{pending?"삭제 중…":"이벤트 삭제"}</button>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
