import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScheduleTime, koreaDateTimeInput } from "../../src/lib/korea-time";
import { publicSchedule, publicComment, safeNextPath } from "../../src/lib/public-data";
import { validateSchedulePayload } from "../../src/lib/validation/schedule";
import { readJsonObject } from "../../src/lib/request-json";

test("schedule times represent Korea time independently of server timezone", () => {
  const old = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Asia/Seoul", "America/New_York"]) {
      process.env.TZ = timezone;
      assert.equal(normalizeScheduleTime("2026-10-12T19:00"), "2026-10-12T10:00:00.000Z");
      assert.equal(koreaDateTimeInput("2026-10-12T10:00:00Z"), "2026-10-12T19:00");
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
test("schedule validation rejects impossible calendar dates and preserves explicit offsets", () => {
  assert.equal(normalizeScheduleTime("2026-02-30T19:00"), null);
  assert.equal(normalizeScheduleTime("2026-10-12T25:00"), null);
  assert.equal(normalizeScheduleTime("2026-10-12T24:00"), null);
  assert.equal(normalizeScheduleTime("2026-10-12T10:00:00Z"), "2026-10-12T10:00:00.000Z");
  const result = validateSchedulePayload({ title: "정기런", scheduleType: "regular", location: "서울", startAt: "2026-10-12T19:00", endAt: "2026-10-12T20:00", registrationEndAt: "2026-10-12T18:00" });
  assert.ok(result.value);
  assert.equal(result.value.start_at,"2026-10-12T10:00:00.000Z");
});
test("member responses remove attendance secrets and deleted comment content without mutation", () => {
  const schedule = { schedule_id: "run", attendance_code: "123456" };
  assert.deepEqual(publicSchedule(schedule), { schedule_id: "run" });
  assert.equal(schedule.attendance_code,"123456");
  assert.equal(publicComment({ deleted_at: "now", content: "secret" }).content, "");
  assert.equal(publicComment({ deleted_at: null, content: "visible" }).content, "visible");
});
test("login continuation only allows local paths", () => {
  for (const value of [null,"javascript:alert(1)","https://example.com","//example.com","/\\example.com","/\nexample.com"]) assert.equal(safeNextPath(value), "/dashboard");
  assert.equal(safeNextPath("/schedules?view=next"),"/schedules?view=next");
});
test("JSON endpoints reject malformed and non-object payloads", async () => {
  for (const body of ["{", "null", "[]", '"text"', ""]) {
    assert.equal(await readJsonObject(new Request("https://example.com", { method: "POST", body })), null);
  }
  assert.deepEqual(await readJsonObject(new Request("https://example.com", { method: "POST", body: '{"content":"hello"}' })), { content: "hello" });
});
