"use client";
import {useRef,useState} from 'react';
import {canSwitchAdministratorMode} from '@/lib/auth/account-access';

function notifyModeChange(){try{localStorage.setItem('runners-admin-mode-change',String(Date.now()));}catch{}}

type ModeProfile={role:string;account_status:string;approval_status:string;withdrawal_pending?:boolean;admin_account?:boolean;admin_mode_normal?:boolean};
export function AdministratorModeSwitch({profile}:{profile:ModeProfile}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitting=useRef(false);
 if(!canSwitchAdministratorMode(profile))return null;
 const current=profile.admin_mode_normal===true?'normal':'admin';
 async function change(mode:'admin'|'normal'){
  if(submitting.current||mode===current)return;
  submitting.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/auth/admin-mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});
   const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error?.message??'모드를 변경하지 못했습니다.');
   notifyModeChange();
   window.location.replace('/dashboard');
  }catch(e){setError(e instanceof Error?e.message:'모드를 변경하지 못했습니다.');submitting.current=false;setBusy(false);}
 }
 return <div className="flex flex-col gap-2">
  <p className="text-xs font-semibold text-zinc-600" role="status">{busy?'모드 전환 중…':`현재: ${current==='admin'?'관리자 모드':'일반 운영진 모드'}`}</p>
  <div role="group" aria-label="이용 모드 선택" aria-busy={busy} className="inline-flex w-fit rounded-xl border border-zinc-200 bg-zinc-100 p-1">
   {([{mode:'admin',label:'관리자'},{mode:'normal',label:'일반 운영진'}] as const).map(({mode,label})=><button key={mode} type="button" aria-label={mode==='admin'?'관리자 모드로 전환':'일반 모드로 전환'} aria-pressed={current===mode} disabled={busy} onClick={()=>void change(mode)} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600 disabled:cursor-wait ${current===mode?'bg-zinc-900 text-white shadow-sm':'text-zinc-600 hover:bg-zinc-200'}`}>{current===mode&&<span aria-hidden="true" className="mr-1">✓</span>}{label}</button>)}
  </div>
  {error&&<p role="alert" className="max-w-64 text-xs text-red-600">{error}</p>}
 </div>;
}
