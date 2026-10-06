import type { Checkpoint, Coordinate, Runner } from "./types";
export type RaceSnapshot = {
 serverNow: string; title: string; currentUserId: string; canManage: boolean; courseLocked: boolean;
 course: { name: string; distanceMeters: number; points: Coordinate[]; startAt: string } | null;
 runners: Runner[]; checkpoints: Record<string, Checkpoint[]>;
 participants: { userId: string; name: string }[];
 entries: { entryId: string; userId: string; bib: string }[];
};
