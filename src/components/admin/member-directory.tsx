'use client';
import {isAdministratorAccount} from '@/lib/auth/account-access';
import {useState} from 'react';
import Link from 'next/link';
import {MemberActions} from './member-actions';
import {MemberDelete} from './member-delete';
import {memberRole} from '@/lib/member-directory';


export type DirectoryMember={user_id:string;name:string;nickname:string|null;role:string;admin_account?:boolean;admin_mode_normal?:boolean;staff_position:string|null;account_status:string;login_id:string;ranking_excluded:boolean;is_pacer:boolean};
const states:Record<string,string>={active:'정상',restricted:'신청 제한',suspended:'이용 정지',withdrawn:'탈퇴 완료',pending:'승인 대기',approved:'승인 완료',rejected:'거절',cancelled:'취소'};


export function MemberDirectory({members,canEdit,isAdmin,selfId}:{members:DirectoryMember[];canEdit:boolean;isAdmin:boolean;selfId:string}){
 const [tab,setTab]=useState('all'),[selected,setSelected]=useState<string[]>([]),[opened,setOpened]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const tabs=[['all','전체'],...(isAdmin?[['admin','관리자']]:[]),['staff','운영진'],['member','회원'],['guest','게스트']];
 const authorized=members.filter(m=>isAdmin||m.role!=='admin');
 const allMembers=authorized.filter(m=>m.role!=='admin');
 const roleOrder:Record<string,number>={admin:0,staff:1,member:2,guest:3,pending:4};
 const inTab=(key:string)=>key==='all'?allMembers:authorized.filter(m=>m.role===key);
 const visible=[...inTab(tab)].sort((a,b)=>(roleOrder[a.role]??5)-(roleOrder[b.role]??5));
 const selectedIds=selected.filter(id=>allMembers.some(m=>m.user_id===id));
 async function download(){
  if(!selectedIds.length||busy)return;setBusy(true);setError('');
  try{const res=await fetch('/api/admin/members/attendance-export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userIds:selectedIds})});
   if(!res.ok){const body=await res.json();throw new Error(body.error?.message??'다운로드에 실패했습니다.');}
   const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]??'runners-attendance.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(e instanceof Error?e.message:'다운로드에 실패했습니다.');}finally{setBusy(false);}
 }
 return <div className="member-directory"><nav className="management-tabs" aria-label="회원 등급">{tabs.map(([key,label])=><button type="button" key={key} aria-pressed={tab===key} onClick={()=>{setTab(key);setOpened(null);setError('');}}>{label} <span>{inTab(key).length}</span></button>)}</nav>
 {tab==='all'&&<div className="member-export-toolbar"><label><input type="checkbox" aria-label="회원 전체 선택" checked={allMembers.length>0&&selectedIds.length===allMembers.length} onChange={e=>setSelected(e.target.checked?allMembers.map(m=>m.user_id):[])}/> 전체 선택</label><span>{selectedIds.length}명 선택 · 전체 기간</span><button type="button" className="button-primary" disabled={!selectedIds.length||busy} onClick={download}>{busy?'파일 생성 중…':'출석 CSV 다운로드'}</button></div>}
 {error&&<p role="alert" className="text-red-600">{error}</p>}
 <div className="member-list-head" aria-hidden="true"><span>이름 / 닉네임</span><span>삭제 여부</span><span>역할</span></div>
 {!visible.length&&<p className="py-8 text-center text-zinc-500">해당 회원이 없습니다.</p>}
 {visible.map(m=><article className="member-list-item" key={m.user_id}><div className="member-list-row">{tab==='all'&&<input type="checkbox" aria-label={`${m.name} 선택`} checked={selectedIds.includes(m.user_id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,m.user_id]:prev.filter(id=>id!==m.user_id))}/>}
 <button type="button" className="member-row-button" aria-expanded={opened===m.user_id} aria-controls={`member-${m.user_id}`} onClick={()=>setOpened(opened===m.user_id?null:m.user_id)}><span><strong>{m.name}</strong><small>{m.nickname||'닉네임 없음'}</small></span><span>계정 존재{m.account_status==='withdrawn'&&<small>탈퇴 계정</small>}</span><span>{memberRole(m.role,m.staff_position)}<small>{opened===m.user_id?'접기 −':'열기 +'}</small></span></button></div>
 {opened===m.user_id&&<MemberPanel key={`${m.user_id}-${m.role}-${m.account_status}-${m.staff_position}`} member={m} canEdit={canEdit} isAdmin={isAdmin} selfId={selfId}/>}
 </article>)}<p className="mt-4 text-xs text-zinc-500">전체 탭은 관리자를 제외한 모든 계정을 표시합니다. 승인 대기·탈퇴 계정도 전체에서 확인할 수 있으며, 완전히 삭제된 계정은 표시되지 않습니다. ‘계정 존재’는 활성 상태와 관계없이 DB에 계정이 남아 있다는 뜻입니다.</p></div>;
}

function MemberPanel({member,canEdit,isAdmin,selfId}:{member:DirectoryMember;canEdit:boolean;isAdmin:boolean;selfId:string}){
 const m=member;
 return <section id={`member-${member.user_id}`} className="member-detail-panel" aria-label={`${member.name} 회원 정보`}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">역할 · 활성 상태</h3><Link href={`/admin/members/${member.user_id}`} className="button-secondary">상세 보기 →</Link></div>
 <div className="mt-4">{canEdit?<><MemberActions userId={m.user_id} role={isAdministratorAccount(m)?"admin":m.role} position={m.staff_position} status={m.account_status} excluded={m.ranking_excluded} isPacer={m.is_pacer} actorIsAdmin={isAdmin} self={m.user_id===selfId} />{!isAdministratorAccount(m)&&m.user_id!==selfId&&<div className="mt-5 border-t pt-4"><MemberDelete userId={m.user_id} loginId={m.login_id} name={m.name}/></div>}</>:<p>조회 전용입니다. {memberRole(m.role,m.staff_position)} · {states[m.account_status]??m.account_status}</p>}</div>
 </section>;
}
