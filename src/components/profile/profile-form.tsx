"use client";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadImage } from "@/lib/images/compress";
type Initial = { name: string; email: string; phone: string; nickname: string | null; profile_image_url: string | null };
export function ProfileForm({ initial, readOnly=false }: { initial: Initial; readOnly?:boolean }) {
  const router = useRouter();
  const [savedName,setSavedName]=useState(initial.name);
  const nameDialog=useRef<HTMLDialogElement>(null);
  const nameConfirmation=useRef<((confirmed:boolean)=>void)|null>(null);
  useEffect(()=>()=>{nameConfirmation.current?.(false);},[]);
  function confirmNameChange():Promise<boolean> {
    if(!nameDialog.current||nameDialog.current.open)return Promise.resolve(false);
    return new Promise(resolve=>{
      nameConfirmation.current=resolve;
      nameDialog.current!.returnValue="cancel";
      nameDialog.current!.showModal();
    });
  }
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [savedImage, setSavedImage] = useState(initial.profile_image_url), [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy||readOnly) return;
    const form = event.currentTarget, values = new FormData(form);
    const name=String(values.get("name")??"").trim();
    const nameChanged=name!==savedName;
    if(nameChanged&&!(await confirmNameChange()))return;
    setBusy(true); setMessage("");
    try {
      const image = file ? await uploadImage(file, "profile") : savedImage;
      setSavedImage(image);
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, nameChangeConfirmed:nameChanged, email: values.get("email"), phone: values.get("phone"), nickname: values.get("nickname"), profileImageUrl: image }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "저장에 실패했습니다.");
      setSavedName(result.data.name??name);
      window.dispatchEvent(new Event("profile-updated"));
      setMessage(result.data.message); setFile(null); setPreview(null);
      (form.elements.namedItem("image") as HTMLInputElement).value = "";
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <><form data-maintenance-blocked={readOnly} onSubmit={submit} className="mt-8 space-y-5">{readOnly&&<p className="text-sm text-amber-700">관리자 설정으로 내 정보 수정이 제한되어 있습니다.</p>}<fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
    <div><h2 className="font-bold">프로필 사진</h2>{preview || savedImage ? <Image unoptimized src={preview ?? savedImage!} alt="내 프로필 사진" width={96} height={96} className="mt-3 h-24 w-24 rounded-full object-cover" /> : <div className="mt-3 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-sm text-emerald-700">사진 없음</div>}<label className="mt-3 block text-sm">사진 선택<input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block max-w-full" onChange={event => { const selected = event.target.files?.[0] ?? null; setFile(selected); setPreview(selected ? URL.createObjectURL(selected) : null); setMessage(""); }} /></label><p className="mt-2 text-sm text-zinc-500">10MB 이하의 JPG·PNG·WebP. 저장할 때 자동 압축하며 기존 사진을 교체합니다.</p></div>
    <label className="block text-sm font-semibold">이름<input name="name" required minLength={2} maxLength={50} autoComplete="name" defaultValue={initial.name} className="input mt-2" aria-describedby="real-name-warning"/><span id="real-name-warning" className="mt-2 block font-normal leading-6 text-amber-700">실제 이름과 다른 이름을 사용하면 불이익을 받을 수 있습니다. 본인의 실제 이름을 입력해주세요.</span></label>
    <label className="block text-sm font-semibold">이메일<input name="email" type="email" required autoComplete="email" defaultValue={initial.email} className="input mt-2" /><span className="mt-1 block font-normal text-zinc-500">변경하면 확인 메일 인증이 필요합니다. 인증 후 변경을 요청한 계정의 내 정보를 새로고침해 이메일을 확인해주세요.</span></label>
    <label className="block text-sm font-semibold">휴대전화<input name="phone" type="tel" maxLength={30} autoComplete="tel" defaultValue={initial.phone} className="input mt-2" /></label>
    <label className="block text-sm font-semibold">닉네임<input name="nickname" maxLength={50} defaultValue={initial.nickname ?? ""} placeholder="랭킹에 표시할 닉네임" className="input mt-2" /></label>
    <button data-maintenance-blocked={readOnly} className="min-h-11 w-full rounded-xl bg-emerald-600 p-3 font-bold text-white">{busy ? "저장 중…" : "프로필 저장"}</button>
    </fieldset>{message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}</form>
    <dialog ref={nameDialog} aria-labelledby="name-change-title" aria-describedby="name-change-description" onClose={()=>{nameConfirmation.current?.(nameDialog.current?.returnValue==="confirm");nameConfirmation.current=null;}} className="fixed inset-0 m-auto max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-sm overflow-y-auto rounded-2xl p-6 shadow-xl backdrop:bg-black/40">
      <h2 id="name-change-title" className="text-xl font-bold">이름 변경 전 확인해주세요</h2>
      <p id="name-change-description" className="mt-4 text-sm leading-7 text-zinc-600">실제 이름과 다른 이름으로 변경하면 불이익을 받을 수 있습니다. 본인의 실제 이름인지 확인한 뒤 저장해주세요.</p>
      <form method="dialog" className="mt-6 grid grid-cols-2 gap-2"><button value="cancel" autoFocus className="min-h-11 rounded-xl border p-3 text-sm font-bold">취소</button><button value="confirm" className="min-h-11 rounded-xl bg-emerald-600 p-3 text-sm font-bold text-white">확인하고 저장</button></form>
    </dialog></>;
}
