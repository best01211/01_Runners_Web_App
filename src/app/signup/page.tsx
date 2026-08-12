"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router=useRouter(); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setLoading(true);setError("");const f=new FormData(e.currentTarget);const body=Object.fromEntries(f.entries());
    try{const r=await fetch("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(!r.ok){setError(j.error?.message??"가입 신청에 실패했습니다.");return;}router.push("/login?signup=complete");}catch{setError("서버와 통신하지 못했습니다.");}finally{setLoading(false);}}
  return <main className="min-h-screen bg-zinc-50 px-4 py-12"><form onSubmit={submit} className="mx-auto max-w-xl space-y-4 rounded-3xl bg-white p-8 shadow-sm"><div><p className="font-bold text-emerald-600">01Runners</p><h1 className="mt-2 text-3xl font-black">회원가입 신청</h1><p className="mt-2 text-sm text-zinc-500">운영진 승인 후 로그인할 수 있습니다.</p></div>
    <Field name="loginId" label="아이디" required/><Field name="email" label="이메일" type="email" required/><div className="grid gap-4 sm:grid-cols-2"><Field name="password" label="비밀번호" type="password" required/><Field name="passwordConfirm" label="비밀번호 확인" type="password" required/></div><Field name="name" label="이름" required/><Field name="nickname" label="랭킹 닉네임 (선택)"/><Field name="phone" label="연락처" placeholder="010-1234-5678" required/><Field name="birthDate" label="생년월일" type="date" required/>
    {error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">{loading?"신청 중...":"가입 신청"}</button><Link href="/login" className="block text-center text-sm text-zinc-500">로그인으로 돌아가기</Link></form></main>;
}
function Field({name,label,type="text",placeholder,required=false}:{name:string;label:string;type?:string;placeholder?:string;required?:boolean}){return <label className="block text-sm font-semibold text-zinc-700">{label}<input name={name} type={type} placeholder={placeholder} required={required} className="mt-2 w-full rounded-xl border border-zinc-300 p-3 font-normal outline-none focus:border-emerald-500"/></label>}
