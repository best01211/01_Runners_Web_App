export type DeletionFile = { bucket: string; name: string };
export type DeletionJob = { job_id: string; target_user_id: string; status: string; storage_files: DeletionFile[] };
export type DeletionPreview = { loginId: string | null; name?: string; status: string; counts: Record<string, number>; shared: Record<string, number>; storageFiles: DeletionFile[] };
const labels: Record<string, string> = {
  member_approval_reviews: "가입 승인 기록", schedule_participations: "일정 참가 기록", attendance_records: "출석 기록", attendances: "출석 기록", comments: "댓글", schedule_comments: "댓글", race_entries: "대회 출전 기록", tracking_race_entries: "대회 출전 기록", withdrawal_requests: "탈퇴 신청 기록", schedules: "공동 일정", tracking_races: "공동 대회", race_courses: "공동 코스", regular_run_templates: "정기런 양식",
};
export function deletionLabel(key: string) { return labels[key.replace(/^public\./, "").split(".")[0]] ?? "연결 기록"; }
export function groupDeletionFiles(files: DeletionFile[]) {
  const buckets = new Map<string, Set<string>>();
  for (const file of files) {
    if (!file || typeof file.bucket !== "string" || typeof file.name !== "string" || !file.bucket || !file.name) throw new Error("INVALID_STORAGE_MANIFEST");
    if (!buckets.has(file.bucket)) buckets.set(file.bucket, new Set());
    buckets.get(file.bucket)!.add(file.name);
  }
  return [...buckets].flatMap(([bucket, paths]) => {
    const names = [...paths];
    return Array.from({ length: Math.ceil(names.length / 100) }, (_, index) => ({ bucket, paths: names.slice(index * 100, (index + 1) * 100) }));
  });
}
