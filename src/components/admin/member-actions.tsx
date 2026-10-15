"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";

type Props = {
  userId:string; role:string; position:string|null; status:string;
  excluded:boolean; isPacer?:boolean; actorIsAdmin?:boolean; self?:boolean;
  onUpdated?:()=>void;
  statusOnly?:boolean;
};
const roles:Record<string,string>={pending:"승인 대기/거절",guest:"게스트",member:"회원",staff:"운영진",admin:"관리자"};
const positions:Record<string,string>={staff:"일반 운영진",vice_president:"부회장",president:"회장"};
const statuses:Record<string,string>={active:"활성",suspended:"정지",restricted:"제한",withdrawn:"탈퇴 완료"};

function FixedValue({label,value}:{label:string;value:string}) {
  return <div className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
    <span className="text-zinc-500">{label}</span><span className="font-semibold text-zinc-800">{value}</span>
  </div>;
}

export function MemberActions({userId,role,position,status,excluded,isPacer=false,actorIsAdmin=false,self=false,onUpdated,statusOnly=false}:Props) {
  const router=useRouter();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const protectedAdmin=!actorIsAdmin&&role==="admin";
  const readOnly=self||protectedAdmin||role==="pending"||status==="withdrawn";
  async function patch(body:{role?:string;[key:string]:unknown}) {
    if(busy||readOnly)return;
    if(body.role==="admin"&&role!=="admin"&&!confirm("관리자로 지정하면 다른 등급으로 변경할 수 없습니다. 관리자 권한을 부여할까요?"))return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch('/api/admin/members/'+userId,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message??"회원 변경에 실패했습니다.");
      router.refresh();
      onUpdated?.();
      if(statusOnly)setMessage('계정 상태를 저장했습니다.');
    }catch(error){setMessage(error instanceof Error?error.message:"서버와 통신하지 못했습니다.")}
    finally{setBusy(false)}
  }
  if(statusOnly)return <div className="space-y-3">
    {readOnly?<FixedValue label="계정 상태" value={statuses[status]??status}/>:<label className="block text-sm">계정 상태<select aria-label="계정 상태" disabled={busy} value={status} onChange={e=>patch({accountStatus:e.target.value})} className="input mt-1"><option value="active">정상 (활성)</option><option value="restricted">신청 제한</option><option value="suspended">이용 정지</option></select></label>}
    <p className="text-xs text-zinc-600">정상: 서비스 이용 가능 · 신청 제한: 조회 가능, 참가 신청 등 신규 활동 제한 · 이용 정지: 서비스 접근 차단</p>
    {self&&<p className="text-sm text-zinc-500">본인 계정의 상태는 변경할 수 없습니다.</p>}
    {message&&<p role="status" className="text-sm">{message}</p>}
  </div>;
  return <div className="grid gap-2 sm:grid-cols-3">
    {readOnly||role==="admin"?<FixedValue label="등급" value={roles[role]??role}/>:<select aria-label="회원 등급" disabled={busy} value={role} onChange={e=>patch({role:e.target.value,staffPosition:e.target.value==="staff"?(position??"staff"):null})} className="min-h-11 rounded-lg border p-2">
      <option value="guest">게스트</option><option value="member">회원</option><option value="staff">운영진</option>{actorIsAdmin&&<option value="admin">관리자</option>}
    </select>}
    {role==="staff"&&(readOnly?<FixedValue label="직책" value={positions[position??"staff"]??position??"일반 운영진"}/>:<select aria-label="운영진 직책" disabled={busy} value={position??"staff"} onChange={e=>patch({role:"staff",staffPosition:e.target.value})} className="min-h-11 rounded-lg border p-2">
      <option value="staff">일반 운영진</option><option value="vice_president">부회장</option><option value="president">회장</option>
    </select>)}
    {readOnly?<FixedValue label="계정 상태" value={statuses[status]??status}/>:<select aria-label="계정 상태" disabled={busy} value={status} onChange={e=>patch({accountStatus:e.target.value})} className="min-h-11 rounded-lg border p-2">
      <option value="active">활성</option><option value="suspended">정지</option><option value="restricted">제한</option>
    </select>}
    {readOnly?<FixedValue label="랭킹" value={excluded?"제외":"포함"}/>:<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={excluded} onChange={e=>patch({rankingExcluded:e.target.checked})}/> 랭킹 제외</label>}
    {readOnly?<FixedValue label="페이서" value={isPacer?"지정":"미지정"}/>:<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={isPacer} onChange={e=>patch({isPacer:e.target.checked})}/> 페이서 지정</label>}
    {self?<p className="text-sm text-zinc-500 sm:col-span-3">본인 계정의 권한과 상태는 변경할 수 없습니다.</p>:protectedAdmin?<p className="text-sm text-zinc-500 sm:col-span-3">관리자 계정은 변경할 수 없습니다.</p>:role==="admin"&&<p className="text-sm text-zinc-500 sm:col-span-3">관리자 등급은 다른 등급으로 변경할 수 없습니다.</p>}
    {message&&<p role="alert" className="text-sm text-red-600 sm:col-span-3">{message}</p>}
  </div>;
}
