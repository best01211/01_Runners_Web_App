import type { Checkpoint, Coordinate, Runner } from "./types";
export type RaceSnapshot = {
 serverNow: string; title: string; currentUserId: string; canManage: boolean; courseLocked: boolean;
 course: { name: string; distanceMeters: number; points: Coordinate[]; startAt: string } | null;
 runners: Runner[]; checkpoints: Record<string, Checkpoint[]>;
 participants: { userId: string; name: string }[];
 entries: { entryId: string; userId: string; bib: string }[];
 raceId?: string;
 eventId?: string;
 courses?: { raceId: string; name: string; distanceMeters: number; startAt: string }[];
 groups?: { groupId: string; name: string; paceSeconds: number }[];
 canRegisterEntries?: boolean;
 timing?: {collectionMode?:"public-page";credentialsReady:boolean;sourceUrl:string;courseCode:string;enabled:boolean;lastSyncedAt:string|null;status:string;message:string};
};
