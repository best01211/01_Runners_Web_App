import assert from "node:assert/strict";
import test from "node:test";
import { isOwnProfileImage, validWebp } from "../../src/lib/images/policy";
import { validateSchedulePayload } from "../../src/lib/validation/schedule";

test("profile images reject foreign hosts, other members and arbitrary paths", () => {
  const base = "https://example.supabase.co";
  const own = `${base}/storage/v1/object/public/01runners-images/member/profile.webp`;
  assert.equal(isOwnProfileImage(`${own}?v=123`, base, "member"), true);
  for (const url of [own.replace("example.supabase.co", "evil.test"), own.replace("member/", "other/"), own.replace("profile.webp", "other.webp"), "javascript:alert(1)", own.replace("https://", "https://user:pass@")]) assert.equal(isOwnProfileImage(url, base, "member"), false);
});
test("uploads reject incorrect WebP signatures, lengths and excess size", () => {
  const bytes = new Uint8Array(24);
  bytes.set(Buffer.from("RIFF")); bytes.set(Buffer.from("WEBPVP8 "), 8);
  new DataView(bytes.buffer).setUint32(4, 16, true);
  assert.equal(validWebp(bytes, 24), true);
  assert.equal(validWebp(bytes, 23), false);
  assert.equal(validWebp(bytes.subarray(0, 10), 24), false);
  bytes[12] = 0; assert.equal(validWebp(bytes, 24), false);
  bytes[12] = 86; bytes[4] = 0; assert.equal(validWebp(bytes, 24), false);
});
test("schedule writes discard image URLs even when supplied directly", () => {
  for (const scheduleType of ["regular", "flash", "training", "event"]) {
    const result = validateSchedulePayload({ title: "러닝 일정", scheduleType, location: "서울", startAt: "2026-10-13T19:00", endAt: "2026-10-13T20:00", registrationEndAt: "2026-10-13T18:00", imageUrl: "https://evil.test/image.jpg", courseImageUrl: "https://evil.test/course.jpg" });
    assert.ok(result.value); assert.equal(result.value.image_url, null); assert.equal(result.value.course_image_url, null);
  }
});
