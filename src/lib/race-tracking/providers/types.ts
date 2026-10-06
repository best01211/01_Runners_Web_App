import type { Checkpoint, Course, Runner } from "../types";

export type RaceInfo = { name: string; startAt: string; course: Course; source: "mock" | "manual" };
export interface TimingProvider {
  getRaceInfo(): RaceInfo;
  getRunner(bib: string): Runner | null;
  getCheckpoints(bib: string, asOf: number): Checkpoint[];
}
