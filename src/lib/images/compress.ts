export async function compressImage(file: File, purpose: "profile" | "regular"): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("JPG, PNG, WebP 사진을 10MB 이하로 선택해주세요.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("사진을 읽을 수 없습니다. 다른 사진을 선택해주세요."); });
  try {
    const scale = Math.min(1, (purpose === "profile" ? 512 : 1600) / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서는 사진을 처리할 수 없습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.type === "image/webp" && blob.size <= (purpose === "profile" ? 200 : 500) * 1024) return new File([blob], `${purpose}.webp`, { type: "image/webp" });
    }
    throw new Error("사진이 너무 큽니다. 더 작은 사진을 선택해주세요.");
  } finally { bitmap.close(); }
}
export async function uploadImage(file: File, purpose: "profile" | "regular", templateId?: string): Promise<string> {
  return uploadPreparedImage(await compressImage(file, purpose), purpose, templateId);
}
export async function uploadPreparedImage(file: File, purpose: "profile" | "regular", templateId?: string): Promise<string> {
  const form = new FormData();
  form.set("file", file); form.set("purpose", purpose);
  if (templateId) form.set("templateId", templateId);
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "사진 저장에 실패했습니다.");
  return result.data.url;
}
