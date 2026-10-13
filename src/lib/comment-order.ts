export function orderComments<T extends { kind: string; created_at: string; comment_id: string }>(comments: T[]): T[] {
  return [...comments].sort((a, b) => {
    const pinned = Number(b.kind === "notice") - Number(a.kind === "notice");
    if (pinned) return pinned;
    return Date.parse(b.created_at) - Date.parse(a.created_at) || b.comment_id.localeCompare(a.comment_id);
  });
}
