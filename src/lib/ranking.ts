export type ScorePolicy = { attended: number; late: number; absent: number; pacer: number; minimumAttendance: number; includeGuests: boolean };
export const DEFAULT_SCORE_POLICY: ScorePolicy = { attended: 10, late: 7, absent: 0, pacer: 3, minimumAttendance: 3, includeGuests: false };
export function parseScorePolicy(value: unknown): ScorePolicy | null {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const record = value as Record<string, unknown>;
 for (const key of ["attended", "late", "absent", "pacer", "minimumAttendance"] as const) {
  if (typeof record[key] !== "number" || !Number.isSafeInteger(record[key]) || record[key] < 0 || record[key] > 100000) return null;
 }
 if (typeof record.includeGuests !== "boolean") return null;
 return record as ScorePolicy;
}
export type RankingAttendance = {
 user_id: string; schedule_id: string; status: string;
 profiles: { login_id: string; nickname: string | null; role: string; account_status: string; approval_status: string; ranking_excluded: boolean; is_test_account: boolean } | null;
 schedules: { start_at: string; status: string; deleted_at: string | null } | null;
};
export function buildRanking(rows: RankingAttendance[], policy: ScorePolicy, pacers: Set<string>, season?: { starts_on: string; ends_on: string } | null) {
 const members = new Map<string, { userId: string; name: string; attended: number; late: number; absent: number; total: number; score: number; attendanceRate: number }>();
 const start = season ? Date.parse(`${season.starts_on}T00:00:00+09:00`) : -Infinity;
 const end = season ? Date.parse(`${season.ends_on}T00:00:00+09:00`) + 86400000 : Infinity;
 for (const row of rows) {
  const p = row.profiles, s = row.schedules;
  if (!p || !s || p.role === "admin" || p.account_status !== "active" || p.approval_status !== "approved" || p.ranking_excluded || p.is_test_account || (!policy.includeGuests && p.role === "guest")) continue;
  if (!["member", "staff", "guest"].includes(p.role) || s.status === "cancelled" || s.deleted_at || !["attended", "late", "absent"].includes(row.status)) continue;
  const at = Date.parse(s.start_at);
  if (!Number.isFinite(at) || at < start || at >= end) continue;
  const v = members.get(row.user_id) ?? { userId: row.user_id, name: p.nickname?.trim() || p.login_id, attended: 0, late: 0, absent: 0, total: 0, score: 0, attendanceRate: 0 };
  v.total++;
  const status = row.status as "attended" | "late" | "absent";
  v[status]++; v.score += policy[status];
  if (status !== "absent" && pacers.has(`${row.schedule_id}:${row.user_id}`)) v.score += policy.pacer;
  members.set(row.user_id, v);
 }
 return [...members.values()].filter(v => v.attended + v.late >= policy.minimumAttendance).map(v => ({ ...v, attendanceRate: Math.round((v.attended + v.late) / v.total * 100) })).sort((a,b) => b.score-a.score || b.attended-a.attended || a.userId.localeCompare(b.userId));
}
