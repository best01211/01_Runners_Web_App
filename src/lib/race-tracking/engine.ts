import { positionAtDistance } from "./course";
import type { Checkpoint, Course, Runner, TrackingState } from "./types";

const positive = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

export function initialPace(runner: Runner, distanceMeters: number): {
  paceSeconds: number; paceSource: TrackingState["paceSource"];
} {
  if (positive(runner.targetTimeSeconds)) return {
    paceSeconds: runner.targetTimeSeconds / (distanceMeters / 1000), paceSource: "target-time" };
  if (positive(runner.targetPaceSeconds)) return { paceSeconds: runner.targetPaceSeconds, paceSource: "target-pace" };
  if (positive(runner.groupPaceSeconds)) return { paceSeconds: runner.groupPaceSeconds, paceSource: "pace-group" };
  return { paceSeconds: 360, paceSource: "default" };
}

export function trackRunner(runner: Runner, records: Checkpoint[], course: Course, now: number): TrackingState {
  const start = Date.parse(runner.startAt);
  if (!Number.isFinite(start) || !Number.isFinite(now)) throw new Error("추적 시각이 올바르지 않습니다.");
  const seen = new Set<string>();
  const checkpoints = records.filter(c => Number.isFinite(c.distanceMeters) && c.distanceMeters >= 0 &&
    c.distanceMeters <= course.distanceMeters && Date.parse(c.passedAt) >= start &&
    Date.parse(c.passedAt) <= now && Date.parse(c.receivedAt) >= Date.parse(c.passedAt) &&
    Date.parse(c.receivedAt) <= now).sort((a, b) => a.distanceMeters - b.distanceMeters ||
      Date.parse(a.passedAt) - Date.parse(b.passedAt)).filter(c => {
        const key = `${c.distanceMeters}:${c.passedAt}`;
        if (seen.has(c.id) || seen.has(key)) return false;
        seen.add(c.id); seen.add(key); return true;
      });
  const valid: Checkpoint[] = [];
  for (const checkpoint of checkpoints) {
    const previous = valid.at(-1);
    if (previous && (checkpoint.distanceMeters <= previous.distanceMeters ||
      Date.parse(checkpoint.passedAt) <= Date.parse(previous.passedAt))) continue;
    if (previous) {
      const segmentPace = (Date.parse(checkpoint.passedAt) - Date.parse(previous.passedAt)) /
        (checkpoint.distanceMeters - previous.distanceMeters);
      // Implausible timing must not become the extrapolation anchor.
      if (segmentPace < 120 || segmentPace > 1200) continue;
    }
    valid.push(checkpoint);
  }
  const last = valid.at(-1) ?? null;
  const actualStart = valid.find(c => c.distanceMeters === 0);
  const startTime = actualStart ? Date.parse(actualStart.passedAt) : start;
  const elapsedSeconds = Math.max(0, (now - startTime) / 1000);
  const segments: number[] = [];
  // Only measured pairs establish timing pace; scheduled start is not a measurement.
  for (let i = 1; i < valid.length; i++) {
    const a = valid[i - 1], b = valid[i];
    const secondsPerKm = (Date.parse(b.passedAt) - Date.parse(a.passedAt)) /
      (b.distanceMeters - a.distanceMeters);
    if (secondsPerKm >= 120 && secondsPerKm <= 1200) segments.push(secondsPerKm);
  }
  let { paceSeconds, paceSource } = initialPace(runner, course.distanceMeters);
  if (segments.length) {
    const recent = segments.slice(-3).reverse(), weights = [0.5, 0.3, 0.2];
    const denominator = recent.reduce((sum, _, i) => sum + weights[i], 0);
    paceSeconds = recent.reduce((sum, pace, i) => sum + pace * weights[i], 0) / denominator;
    paceSource = "timing";
  }
  const age = last ? Math.max(0, (now - Date.parse(last.passedAt)) / 1000) : null;
  const anchor = last?.distanceMeters ?? 0;
  const sinceAnchor = last ? age! : elapsedSeconds;
  // Cap extrapolation after 45 minutes, including unmeasured initial predictions.
  let distanceMeters = Math.min(course.distanceMeters, anchor + Math.min(sinceAnchor, 2700) / paceSeconds * 1000);
  let status: TrackingState["status"] = "running";
  if (runner.status === "dns") { status = "dns"; distanceMeters = 0; }
  else if (now < startTime) { status = "not-started"; distanceMeters = 0; }
  else if (runner.status === "dnf") { status = "dnf"; distanceMeters = anchor; }
  else if (last?.distanceMeters === course.distanceMeters) { status = "finished"; distanceMeters = course.distanceMeters; }
  else if (sinceAnchor >= 2700) status = "stale";
  else if (distanceMeters >= course.distanceMeters) status = "finish-pending";
  const finishElapsed = last ? (Date.parse(last.passedAt) - startTime) / 1000 : 0;
  const estimatedFinishSeconds = status === "finished" ? (actualStart ? finishElapsed : null) :
    ["dnf", "dns", "stale"].includes(status) ? null :
      finishElapsed + (course.distanceMeters - anchor) / 1000 * paceSeconds;
  return { runner, distanceMeters, paceSeconds, paceSource, status, lastCheckpoint: last,
    confidence: !last || paceSource !== "timing" ? "LOW" : age! <= 300 ? "HIGH" : age! <= 900 ? "MEDIUM" : "LOW",
    secondsSinceCheckpoint: age, estimatedFinishSeconds, elapsedSeconds,
    startSource: actualStart ? "measured" : "scheduled",
    position: positionAtDistance(course, distanceMeters) };
}
