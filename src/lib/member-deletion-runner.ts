import { groupDeletionFiles, type DeletionJob } from "./member-deletion";
type Steps = {
  removeFiles: (bucket: string, paths: string[]) => Promise<boolean>;
  markStorageCleaned: () => Promise<boolean>;
  deleteAuth: () => Promise<boolean>;
  markCompleted: () => Promise<boolean>;
};
export async function finishMemberDeletion(job: DeletionJob, steps: Steps): Promise<"completed" | "storage" | "storage_state" | "auth" | "finalize" | "connection"> {
  if (job.status === "completed") return "completed";
  try {
    if (job.status !== "storage_cleaned") {
      for (const group of groupDeletionFiles(job.storage_files)) if (!await steps.removeFiles(group.bucket, group.paths)) return "storage";
      if (!await steps.markStorageCleaned()) return "storage_state";
    }
    if (!await steps.deleteAuth()) return "auth";
    if (!await steps.markCompleted()) return "finalize";
    return "completed";
  } catch { return "connection"; }
}
