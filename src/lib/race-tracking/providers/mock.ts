import { buildCourse } from "../course";
import { SEOUL_RACE_POINTS } from "./seoul-race-course";
import type { Checkpoint, Runner } from "../types";
import type { RaceInfo, TimingProvider } from "./types";

export const DEMO_START = Date.parse("2027-03-21T08:00:00+09:00");
export const DEMO_DURATION_SECONDS = 3 * 3600;
// Half-marathon simulation distance; not certification of the GPX or actual race timing.
export const DEMO_COURSE = buildCourse(SEOUL_RACE_POINTS, 21097.5);

type Scenario = { runner: Runner; paces: number[]; delaySeconds: number; missing?: number[]; stopAt?: number; dns?: boolean };
export const DEMO_RUNNERS: Runner[] = [
  { id: "mock-1", name: "가상 선수 진우", bib: "012345", startAt: new Date(DEMO_START).toISOString(), targetTimeSeconds: 7200, status: "running" },
  { id: "mock-2", name: "가상 선수 영희", bib: "15322", startAt: new Date(DEMO_START + 120000).toISOString(), targetPaceSeconds: 320, status: "running" },
  { id: "mock-3", name: "가상 선수 철수", bib: "13521", startAt: new Date(DEMO_START + 300000).toISOString(), groupPaceSeconds: 390, status: "running" },
  { id: "mock-4", name: "계측 누락 예시", bib: "20004", startAt: new Date(DEMO_START).toISOString(), targetPaceSeconds: 350, status: "running" },
  { id: "mock-5", name: "중도 포기 예시", bib: "20005", startAt: new Date(DEMO_START).toISOString(), targetPaceSeconds: 360, status: "running" },
  { id: "mock-6", name: "미출발 예시", bib: "20006", startAt: new Date(DEMO_START).toISOString(), status: "dns" },
];
const scenarios: Scenario[] = DEMO_RUNNERS.map((runner, i) => ({ runner,
  paces: i === 1 ? [270, 280, 290, 300, 310, 320, 330, 340, 350] :
    i === 2 ? [380, 385, 390, 400, 415, 430, 440, 450, 460] :
    i === 3 ? [370, 375, 380, 385, 390, 395, 400, 405, 410] :
    i === 4 ? [350, 355, 360, 365, 370, 375, 380, 385, 390] : [330, 335, 340, 345, 350, 355, 365, 375, 380],
  delaySeconds: i === 3 ? 420 : 30,
  missing: i === 3 ? [10000, 15000, 20000, 25000] : [],
  stopAt: i === 4 ? 15000 : undefined, dns: i === 5,
}));

export class MockTimingProvider implements TimingProvider {
  getRaceInfo(): RaceInfo {
    return { name: "서울레이스 21K 추적 데모", startAt: new Date(DEMO_START).toISOString(), course: DEMO_COURSE, source: "mock" };
  }
  getRunner(bib: string): Runner | null {
    const runner = scenarios.find(s => s.runner.bib === bib)?.runner;
    return runner ? { ...runner } : null;
  }
  getCheckpoints(bib: string, asOf: number): Checkpoint[] {
    const scenario = scenarios.find(s => s.runner.bib === bib);
    if (!scenario || scenario.dns || !Number.isFinite(asOf)) return [];
    const distances = [0, 5000, 10000, 15000, 20000, DEMO_COURSE.distanceMeters];
    let passed = Date.parse(scenario.runner.startAt);
    const checkpoints: Checkpoint[] = [];
    for (let i = 0; i < distances.length; i++) {
      const distance = distances[i];
      if (i > 0) passed += (distance - distances[i - 1]) / 1000 * scenario.paces[i - 1] * 1000;
      const received = passed + scenario.delaySeconds * 1000;
      if (received > asOf || (scenario.stopAt !== undefined && distance > scenario.stopAt) || scenario.missing?.includes(distance)) continue;
      checkpoints.push({ id: `${scenario.runner.id}-${distance}`, name: distance === 0 ? "START" : distance === DEMO_COURSE.distanceMeters ? "FINISH" : `${distance / 1000}K`,
        distanceMeters: distance, passedAt: new Date(passed).toISOString(), receivedAt: new Date(received).toISOString(), source: "mock" });
    }
    return checkpoints;
  }
  getRunners(asOf: number): Runner[] {
    return scenarios.map(s => ({ ...s.runner, status: s.stopAt !== undefined &&
      asOf >= Date.parse(s.runner.startAt) + 5400 * 1000 ? "dnf" : s.runner.status }));
  }
}
