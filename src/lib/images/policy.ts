export function isOwnProfileImage(url: string, baseUrl: string, userId: string): boolean {
  try {
    const actual = new URL(url), base = new URL(baseUrl);
    return actual.origin === base.origin && actual.pathname === `${base.pathname.replace(/\/$/, "")}/storage/v1/object/public/01runners-images/${userId}/profile.webp` && !actual.username && !actual.password;
  } catch { return false; }
}
export function validWebp(bytes: Uint8Array, limit: number): boolean {
  if (bytes.length < 20 || bytes.length > limit) return false;
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  return text(0, 4) === "RIFF" && text(8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(text(12, 16)) && size + 8 === bytes.length;
}
