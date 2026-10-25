'use client';
import {useState,useEffect} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
export function PendingRefresh(){const router=useRouter();return <button type="button" className="button-primary" onClick={()=>router.refresh()}>승인 상태 새로고침</button>;}
export function ApprovalHelp({supportUrl}:{supportUrl?:string}){
 const [copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false);
 const inquiry='안녕하세요. 가입 승인 상태를 확인하고 싶습니다.\n가입 아이디: \n가입 신청 날짜: ';
 const [configured,setConfigured]=useState(supportUrl);
 useEffect(()=>{if(supportUrl)return;let alive=true;void fetch('/api/auth/member-help',{cache:'no-store'}).then(r=>r.json()).then(j=>{if(alive&&j.success&&j.data.url)setConfigured(j.data.url);}).catch(()=>{});return()=>{alive=false;};},[supportUrl]);
 return <section className="space-y-3 rounded-xl border bg-zinc-50 p-4"><h2 className="font-bold">승인·가입 문의</h2><p className="text-sm">운영진이 가입 신청을 순서대로 확인합니다. 처리 시간은 운영 상황에 따라 달라요. 가입 안내를 받은 크루 채팅방의 운영진에게 아이디와 신청 날짜를 알려주세요.</p>{configured&&<a href={configured} className="button-secondary" target="_blank" rel="noreferrer">운영진 문의 열기</a>}<button type="button" className="button-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(inquiry);setCopied(true);setCopyFailed(false);}catch{setCopied(false);setCopyFailed(true);}}}>{copied?'문의 문구를 복사했어요':'문의 문구 복사'}</button>{copyFailed&&<label className="block text-sm">자동 복사를 사용할 수 없어요. 아래 문구를 직접 복사해주세요.<textarea readOnly value={inquiry} className="input mt-2" onFocus={e=>e.target.select()}/></label>}<p className="text-xs text-zinc-500">문의할 때 비밀번호나 인증번호는 보내지 마세요.</p></section>;
}
export function AccountHelpRequest(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(busy)return;const email=new FormData(e.currentTarget).get('email');setBusy(true);setMessage('');try{const r=await fetch('/api/auth/account-help',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const j=await r.json();setMessage(r.ok?j.data.message:j.error?.message??'메일을 보내지 못했습니다.');}catch{setMessage('연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}finally{setBusy(false);}}}><p>가입 이메일로 본인 확인 링크를 보내드립니다. 링크를 연 뒤 내 아이디와 가입 승인 상태를 확인할 수 있어요.</p><label className="block">가입 이메일<input required name="email" type="email" autoComplete="email" className="input mt-1"/></label><button disabled={busy} className="button-primary w-full">{busy?'전송 중…':'본인 확인 메일 보내기'}</button>{message&&<p role="status" className="rounded-xl bg-zinc-50 p-3">{message}</p>}<p className="text-sm">메일을 열었는데 확인되지 않으면 링크를 요청한 브라우저에서 다시 열어주세요.</p><Link href="/login" className="text-link">로그인으로 돌아가기</Link></form>;
}
