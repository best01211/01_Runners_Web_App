"use client";

import {useState, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {participationGroupLabel, type ParticipationGroup} from "@/lib/participation-groups";

type Member = {userId:string; name:string; groupId:string|null; isStaff:boolean};
export function PaceGroupManagement({scheduleId,groups,members,locked,blocked=false}:{scheduleId:string;groups:ParticipationGroup[];members:Member[];locked:boolean;blocked?:boolean}) {
 const router=useRouter();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[search,setSearch]=useState(""),[userId,setUserId]=useState(""),[destination,setDestination]=useState("");
 const member=members.find(m=>m.userId===userId);
 const matches=members.filter(m=>m.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const disabled=busy||locked||blocked;
 async function write(action:"edit"|"delete"|"move",body:object) {
  if(disabled)return;
  setBusy(true);setMessage("");
  try {
   const response=await fetch(`/api/schedules/${scheduleId}/pace-groups`,{method:action==="delete"?"DELETE":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...body})});
   const result=await response.json();if(!response.ok)throw Error(result.error?.message??"처리하지 못했습니다.");
   setMessage(action==="move"?"참가자 그룹을 이동했습니다.":action==="delete"?"그룹을 삭제했습니다.":"그룹을 수정했습니다.");
   if(action==="move"){setUserId("");setDestination("");}router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:"서버와 통신하지 못했습니다.");}finally{setBusy(false);}
 }
 function edit(event:FormEvent<HTMLFormElement>,group:ParticipationGroup) {
  event.preventDefault();const data=new FormData(event.currentTarget);
  const paceSeconds=Number(data.get("minutes"))*60+Number(data.get("seconds")),distanceKm=Number(data.get("distance"));
  const count=members.filter(m=>m.groupId===group.pace_group_id).length;
  if(count&&!window.confirm(`이 그룹의 참가자 ${count}명에게 변경된 페이스와 거리가 적용됩니다. 수정할까요?`))return;
  void write("edit",{groupId:group.pace_group_id,paceSeconds,distanceKm});
 }
 return <details className="staff-group-management mt-6 rounded-2xl border p-4"><summary className="min-h-11 cursor-pointer content-center font-semibold">운영진 그룹 관리</summary>
  <p className="mt-3 text-sm text-zinc-600">출석 시작 전, 모집 중인 일정에서 그룹 수정·삭제와 참가자 이동을 할 수 있습니다. 짐보관·포토 그룹은 유지되며, 신청 이력이 있는 그룹은 삭제할 수 없습니다.</p>
  {locked&&<p className="mt-3 text-sm text-amber-800">출석이 시작되었거나 모집 중인 일정이 아니어서 그룹 관리가 잠겼습니다.</p>}
  {blocked&&<p className="mt-3 text-sm text-amber-800">현재 점검 중으로 그룹 관리를 사용할 수 없습니다.</p>}
  <div className="mt-4 space-y-4">{groups.filter(g=>!g.group_kind||g.group_kind==="running").map(group=><form key={`${group.pace_group_id}:${group.pace_seconds}:${group.distance_km}`} onSubmit={e=>edit(e,group)} className="rounded-xl border p-3">
   <h3 className="font-semibold">{participationGroupLabel(group)}</h3>
   <fieldset disabled={disabled} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
    <label className="text-sm">페이스 분<input name="minutes" aria-label={`${participationGroupLabel(group)} 페이스 분`} className="input mt-1" type="number" min="0" max="120" required defaultValue={Math.floor(group.pace_seconds/60)}/></label>
    <label className="text-sm">페이스 초<select name="seconds" className="input mt-1" defaultValue={group.pace_seconds%60}><option value="0">00초</option><option value="30">30초</option></select></label>
    <label className="text-sm">거리 km<input name="distance" className="input mt-1" type="number" min="5" step="1" required defaultValue={group.distance_km}/></label>
    <div className="staff-group-actions col-span-full"><button className="button-primary">그룹 수정</button><button type="button" className="button-secondary" disabled={members.some(m=>m.groupId===group.pace_group_id)} onClick={()=>{if(window.confirm(`${participationGroupLabel(group)} 그룹을 삭제할까요?`))void write("delete",{groupId:group.pace_group_id});}}>그룹 삭제</button></div>
   </fieldset>
  </form>)}</div>
  <form className="mt-5 space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();if(member&&window.confirm(`${member.name}님의 참가 그룹을 변경할까요?`))void write("move",{userId,groupId:destination});}}>
   <h3 className="font-semibold">참가자 그룹 이동</h3>
   <fieldset disabled={disabled} className="space-y-3">
    <label className="block text-sm">참가자 이름 검색<input className="input mt-1" value={search} onChange={e=>{setSearch(e.target.value);setUserId("");setDestination("");}} placeholder="이름으로 찾기"/></label>
    <label className="block text-sm">이동할 참가자<select required className="input mt-1" value={userId} onChange={e=>{setUserId(e.target.value);setDestination("");}}><option value="">참가자를 선택해주세요 ({matches.length}명)</option>{matches.map(m=><option key={m.userId} value={m.userId}>{m.name} · {groups.find(g=>g.pace_group_id===m.groupId)?participationGroupLabel(groups.find(g=>g.pace_group_id===m.groupId)!):"그룹 미지정"}</option>)}</select></label>
    <label className="block text-sm">변경할 그룹<select required className="input mt-1" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">그룹을 선택해주세요</option>{groups.filter(g=>g.pace_group_id!==member?.groupId&&(g.group_kind!=="storage"||member?.isStaff)).map(g=><option key={g.pace_group_id} value={g.pace_group_id}>{participationGroupLabel(g)}</option>)}</select></label>
    <button className="button-primary w-full" disabled={!member||!destination}>참가자 이동</button>
   </fieldset>
  </form>
  {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
 </details>;
}
