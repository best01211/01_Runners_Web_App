// datetime-local fields in this app explicitly represent Korea time.
export function koreaDateTimeInput(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
  return new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function normalizeScheduleTime(value: string) {
  const explicit = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
  const input = local.test(value) ? `${value}+09:00` : explicit.test(value) ? value : "";
  if (!input || !Number.isFinite(Date.parse(input))) return null;
  const clock = value.slice(11, 19).split(":");
  if (Number(clock[0]) > 23 || Number(clock[1]) > 59 || (clock[2] && Number(clock[2].slice(0, 2)) > 59)) return null;
  const datePart = value.slice(0, 10);
  const calendar = new Date(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== datePart) return null;
  return new Date(input).toISOString();
}
