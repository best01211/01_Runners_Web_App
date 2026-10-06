export type Coordinate = { latitude: number; longitude: number };
export type Course = {
  points: Coordinate[];
  cumulativeMeters: number[];
  measuredMeters: number;
  distanceMeters: number;
};
export type Checkpoint = {
  id: string;
  name: string;
  distanceMeters: number;
  passedAt: string;
  receivedAt: string;
  source: "mock" | "manual";
};
export type Runner = {
  id: string;
  name: string;
  bib: string;
  startAt: string;
  targetTimeSeconds?: number;
  targetPaceSeconds?: number;
  groupPaceSeconds?: number;
  status: "running" | "dnf" | "dns";
};
export type TrackingState = {
  runner: Runner;
  distanceMeters: number;
  paceSeconds: number;
  paceSource: "target-time" | "target-pace" | "pace-group" | "default" | "timing";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  status: "not-started" | "running" | "stale" | "finish-pending" | "finished" | "dnf" | "dns";
  lastCheckpoint: Checkpoint | null;
  secondsSinceCheckpoint: number | null;
  estimatedFinishSeconds: number | null;
  elapsedSeconds: number;
  startSource: "measured" | "scheduled";
  position: Coordinate;
};
