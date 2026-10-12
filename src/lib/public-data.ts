// Keep operational secrets out of member-facing schedule responses.
export function publicSchedule<T extends Record<string, unknown>>(schedule: T) {
  const { attendance_code: _code, ...visible } = schedule;
  void _code;
  return visible;
}

export function publicComment<T extends { deleted_at: unknown; content: string }>(comment: T) {
  return comment.deleted_at ? { ...comment, content: "" } : comment;
}

export function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u0020]/.test(value)
    ? value : "/dashboard";
}
