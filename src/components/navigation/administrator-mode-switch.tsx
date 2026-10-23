"use client";
import {useState} from 'react';
import {canSwitchAdministratorMode} from '@/lib/auth/account-access';
type ModeProfile={role:string;account_status:string;approval_status:string;withdrawal_pending?:boolean;admin_account?:boolean;admin_mode_normal?:boolean};
export function AdministratorModeSwitch({profile}:{profile:ModeProfile}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!canSwitchAdministratorMode(profile))return null;
 const normal=profile.admin_mode_normal===true;
 return <div className="flex flex-col gap-1"><button type="button" disabled={busy} aria-label={normal?'관리자 모드로 전환':'일반 모드로 전환'} onClick={async()=>{
  if(busy)return;setBusy(true);setError('');
  try{const response=await fetch('/api/auth/admin-mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:normal?'admin':'normal'})});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error?.message??'모드를 변경하지 못했습니다.');
   try{localStorage.setItem('runners-admin-mode-change',String(Date.now()));}catch{}
   window.location.replace('/dashboard');
  }catch(e){setError(e instanceof Error?e.message:'모드를 변경하지 못했습니다.');setBusy(false);}
 }} className="min-h-11 rounded-xl border border-current/20 px-3 py-2 text-xs font-semibold disabled:opacity-40">{busy?'전환 중…':normal?'일반 모드 → 관리자 모드':'관리자 모드 → 일반 모드'}</button>{error&&<p role="alert" className="max-w-64 text-xs text-red-600">{error}</p>}</div>;
}
