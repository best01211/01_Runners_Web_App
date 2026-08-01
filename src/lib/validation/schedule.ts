export type SchedulePayload = Record<string, unknown>;

const TYPES = new Set(["regular", "training", "flash", "event"]);

export function validateSchedulePayload(body: SchedulePayload) {
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const scheduleType = String(body.scheduleType ?? "").trim();
  const location = String(body.location ?? "").trim();
  const startAt = String(body.startAt ?? "").trim();
  const registrationEndAt = String(body.registrationEndAt ?? "").trim();
  const capacity = body.capacity === "" || body.capacity == null ? null : Number(body.capacity);

  if (title.length < 2 || title.length > 100) return { error: "제목은 2~100자로 입력해 주세요." };
  if (!TYPES.has(scheduleType)) return { error: "올바른 일정 유형을 선택해 주세요." };
  if (location.length < 2) return { error: "장소를 입력해 주세요." };
  if (Number.isNaN(Date.parse(startAt))) return { error: "시작 일시가 올바르지 않습니다." };
  if (Number.isNaN(Date.parse(registrationEndAt))) return { error: "신청 마감 일시가 올바르지 않습니다." };
  if (new Date(registrationEndAt) > new Date(startAt)) return { error: "신청 마감은 일정 시작 전이어야 합니다." };
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return { error: "정원은 1 이상의 정수여야 합니다." };

  return {
    value: {
      title,
      description,
      schedule_type: scheduleType,
      location,
      start_at: new Date(startAt).toISOString(),
      registration_end_at: new Date(registrationEndAt).toISOString(),
      capacity,
      guest_allowed: body.guestAllowed === true,
      comment_enabled: body.commentEnabled !== false,
    },
  };
}
