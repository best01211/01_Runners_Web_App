"use client";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadImage } from "@/lib/images/compress";
type Initial = { email: string; phone: string; nickname: string | null; profile_image_url: string | null };
export function ProfileForm({ initial, readOnly=false }: { initial: Initial; readOnly?:boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [savedImage, setSavedImage] = useState(initial.profile_image_url), [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy||readOnly) return;
    const form = event.currentTarget, values = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const image = file ? await uploadImage(file, "profile") : savedImage;
      setSavedImage(image);
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), phone: values.get("phone"), nickname: values.get("nickname"), profileImageUrl: image }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "저장에 실패했습니다.");
      setMessage(result.data.message); setFile(null); setPreview(null);
      (form.elements.namedItem("image") as HTMLInputElement).value = "";
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "서버와 통신하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <form data-maintenance-blocked={readOnly} onSubmit={submit} className="mt-8 space-y-5">{readOnly&&<p className="text-sm text-amber-700">관리자 설정으로 내 정보 수정이 제한되어 있습니다.</p>}<fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
    <div><h2 className="font-bold">프로필 사진</h2>{preview || savedImage ? <Image unoptimized src={preview ?? savedImage!} alt="내 프로필 사진" width={96} height={96} className="mt-3 h-24 w-24 rounded-full object-cover" /> : <div className="mt-3 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-sm text-emerald-700">사진 없음</div>}<label className="mt-3 block text-sm">사진 선택<input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block max-w-full" onChange={event => { const selected = event.target.files?.[0] ?? null; setFile(selected); setPreview(selected ? URL.createObjectURL(selected) : null); setMessage(""); }} /></label><p className="mt-2 text-sm text-zinc-500">10MB 이하의 JPG·PNG·WebP. 저장할 때 자동 압축하며 기존 사진을 교체합니다.</p></div>
    <label className="block text-sm font-semibold">이메일<input name="email" type="email" required autoComplete="email" defaultValue={initial.email} className="input mt-2" /><span className="mt-1 block font-normal text-zinc-500">변경하면 확인 메일 인증이 필요합니다.</span></label>
    <label className="block text-sm font-semibold">휴대전화<input name="phone" type="tel" maxLength={30} autoComplete="tel" defaultValue={initial.phone} className="input mt-2" /></label>
    <label className="block text-sm font-semibold">닉네임<input name="nickname" maxLength={50} defaultValue={initial.nickname ?? ""} placeholder="랭킹에 표시할 닉네임" className="input mt-2" /></label>
    <button data-maintenance-blocked={readOnly} className="min-h-11 w-full rounded-xl bg-emerald-600 p-3 font-bold text-white">{busy ? "저장 중…" : "프로필 저장"}</button>
    </fieldset>{message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}</form>;
}
