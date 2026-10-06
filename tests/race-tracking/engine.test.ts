import assert from "node:assert/strict";
import test from "node:test";
import { buildCourse, courseFromGeoJSON, distanceBetween, positionAtDistance } from "../../src/lib/race-tracking/course";
import { initialPace, trackRunner } from "../../src/lib/race-tracking/engine";
import { DEMO_START, DEMO_COURSE, MockTimingProvider } from "../../src/lib/race-tracking/providers/mock";
import type { Checkpoint, Runner } from "../../src/lib/race-tracking/types";

const course = buildCourse([{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.1 }, { latitude: 0, longitude: 0.2 }], 20000);
const start = Date.parse("2027-03-21T08:00:00+09:00");
const runner: Runner = { id: "runner", name: "테스트", bib: "00123", startAt: new Date(start).toISOString(), targetPaceSeconds: 330, status: "running" };
const checkpoint = (distance: number, seconds: number, delay = 0): Checkpoint => ({
  id: String(distance), name: `${distance / 1000}K`, distanceMeters: distance,
  passedAt: new Date(start + seconds * 1000).toISOString(), receivedAt: new Date(start + (seconds + delay) * 1000).toISOString(), source: "mock",
});
const track = (records: Checkpoint[], seconds: number, override: Partial<Runner> = {}) =>
  trackRunner({ ...runner, ...override }, records, course, start + seconds * 1000);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test("Haversine distance and official-distance mapping", () => {
  near(distanceBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(course.measuredMeters > 22000 && course.measuredMeters < 22300);
  near(positionAtDistance(course, 10000).longitude, 0.1);
  assert.deepEqual(positionAtDistance(course, -1), course.points[0]);
  assert.deepEqual(positionAtDistance(course, 50000), course.points.at(-1));
});
test("repeated course points do not divide by zero", () => {
  const repeated = buildCourse([course.points[0], course.points[0], course.points[1]], 10000);
  near(positionAtDistance(repeated, 5000).longitude, 0.05);
});
test("course input rejects empty, degenerate, invalid coordinates and distances", () => {
  assert.throws(() => buildCourse([]));
  assert.throws(() => buildCourse([course.points[0], course.points[0]]));
  assert.throws(() => buildCourse([{ latitude: 100, longitude: 0 }, course.points[0]]));
  assert.throws(() => buildCourse(course.points, NaN));
  assert.throws(() => positionAtDistance(course, NaN));
});
test("GeoJSON preserves longitude/latitude and rejects disconnected routes", () => {
  const imported = courseFromGeoJSON({ type: "Feature", geometry: { type: "LineString", coordinates: [[127, 37], [127.1, 37.1]] } });
  assert.deepEqual(imported.points[0], { longitude: 127, latitude: 37 });
  assert.throws(() => courseFromGeoJSON({ type: "MultiLineString", coordinates: [] }));
  assert.throws(() => courseFromGeoJSON({ type: "LineString", coordinates: [["127", 37], [127.1, 37.1]] }));
});
test("initial pace uses target time, target pace, group pace, then default", () => {
  near(initialPace({ ...runner, targetTimeSeconds: 6000, groupPaceSeconds: 400 }, 20000).paceSeconds, 300);
  assert.equal(initialPace(runner, 20000).paceSource, "target-pace");
  assert.equal(initialPace({ ...runner, targetPaceSeconds: NaN, groupPaceSeconds: 400 }, 20000).paceSeconds, 400);
  assert.equal(initialPace({ ...runner, targetPaceSeconds: -1 }, 20000).paceSeconds, 360);
});
test("before scheduled start, position stays at zero", () => {
  const state = track([], -60);
  assert.equal(state.status, "not-started"); assert.equal(state.distanceMeters, 0);
});
test("initial prediction is low confidence", () => {
  const state = track([], 600);
  near(state.distanceMeters, 600 / 330 * 1000);
  assert.equal(state.confidence, "LOW"); assert.equal(state.paceSource, "target-pace");
});
test("actual start and checkpoint establish timing pace", () => {
  const state = track([checkpoint(0, 0), checkpoint(10000, 3300)], 3900);
  near(state.paceSeconds, 330); near(state.distanceMeters, 10000 + 600 / 330 * 1000);
  assert.equal(state.confidence, "MEDIUM"); assert.equal(state.paceSource, "timing");
});
test("first positive checkpoint alone is not confused with a measured start", () => {
  const state = track([checkpoint(10000, 3000)], 3100);
  assert.equal(state.paceSource, "target-pace"); assert.equal(state.confidence, "LOW");
});
test("weighted pace uses the latest three segments", () => {
  const state = track([checkpoint(0, 0), checkpoint(5000, 1500), checkpoint(10000, 3150), checkpoint(15000, 4950)], 5000);
  near(state.paceSeconds, 360 * 0.5 + 330 * 0.3 + 300 * 0.2);
});
test("two-segment weights are normalized", () => {
  const state = track([checkpoint(0, 0), checkpoint(5000, 1500), checkpoint(10000, 3150)], 3200);
  near(state.paceSeconds, (330 * 0.5 + 300 * 0.3) / 0.8);
});
test("future or not yet delivered records are invisible", () => {
  const state = track([checkpoint(0, 0), checkpoint(10000, 3300, 120)], 3350);
  assert.equal(state.lastCheckpoint?.distanceMeters, 0);
  const future = track([checkpoint(10000, 3300)], 100);
  assert.equal(future.lastCheckpoint, null);
});
test("duplicates and out-of-order delivery preserve the measured pace", () => {
  const records = [checkpoint(10000, 3300), checkpoint(0, 0), checkpoint(10000, 3300), checkpoint(5000, 1500)];
  const state = track(records, 3400);
  near(state.paceSeconds, (360 * 0.5 + 300 * 0.3) / 0.8);
});
test("invalid chronology, invalid time and out-of-course records are discarded", () => {
  const state = track([checkpoint(0, 0), checkpoint(10000, 3300), checkpoint(15000, 3000),
    checkpoint(25000, 8000), { ...checkpoint(18000, 6000), passedAt: "bad" }], 9000);
  assert.equal(state.lastCheckpoint?.distanceMeters, 10000);
});
test("confidence boundaries reflect checkpoint age", () => {
  const records = [checkpoint(0, 0), checkpoint(10000, 3300)];
  assert.equal(track(records, 3600).confidence, "HIGH");
  assert.equal(track(records, 3601).confidence, "MEDIUM");
  assert.equal(track(records, 4200).confidence, "MEDIUM");
  assert.equal(track(records, 4201).confidence, "LOW");
});
test("long missing timing caps extrapolation and removes finish prediction", () => {
  const a = track([checkpoint(0, 0), checkpoint(5000, 1650)], 4650);
  const b = track([checkpoint(0, 0), checkpoint(5000, 1650)], 10000);
  assert.equal(a.status, "stale"); assert.equal(a.estimatedFinishSeconds, null);
  near(a.distanceMeters, b.distanceMeters);
});
test("predicted course end never creates a measured finish", () => {
  const state = track([checkpoint(0, 0), checkpoint(15000, 4950)], 6600);
  assert.equal(state.distanceMeters, 20000); assert.equal(state.status, "finish-pending");
});
test("measured finish freezes location and uses actual net time", () => {
  const records = [checkpoint(0, 120), checkpoint(10000, 3420), checkpoint(20000, 6840)];
  const state = track(records, 10000);
  assert.equal(state.status, "finished"); assert.equal(state.estimatedFinishSeconds, 6720);
});
test("DNS and DNF do not extrapolate", () => {
  assert.equal(track([], 9000, { status: "dns" }).distanceMeters, 0);
  const dnf = track([checkpoint(5000, 1650)], 9000, { status: "dnf" });
  assert.equal(dnf.distanceMeters, 5000); assert.equal(dnf.estimatedFinishSeconds, null);
});
test("invalid clock is rejected", () => {
  assert.throws(() => trackRunner(runner, [], course, NaN));
  assert.throws(() => track([], 10, { startAt: "bad" }));
});
test("mock timing is deterministic, sequential, delayed and isolated", () => {
  const provider = new MockTimingProvider();
  const now = DEMO_START + 7200 * 1000;
  assert.deepEqual(provider.getCheckpoints("012345", now), provider.getCheckpoints("012345", now));
  assert.equal(provider.getCheckpoints("012345", DEMO_START + 29000).length, 0);
  assert.equal(provider.getCheckpoints("012345", DEMO_START + 30000).length, 1);
  assert.equal(provider.getRunner("012345")?.bib, "012345");
  assert.equal(provider.getRunner("unknown"), null);
  assert.deepEqual(provider.getCheckpoints("20006", now), []);
  assert.ok(provider.getCheckpoints("20004", now).every(c => ![10000, 15000, 20000, 25000].includes(c.distanceMeters)));
  assert.equal(provider.getRunners(now).find(r => r.bib === "20005")?.status, "dnf");
  assert.ok(provider.getCheckpoints("012345", DEMO_START + 18000000).some(c => c.name === "FINISH"));
});

test("implausible timing cannot create a finish or position anchor", () => {
  const state = track([checkpoint(0, 0), checkpoint(5000, 1650), checkpoint(20000, 1800)], 1900);
  assert.equal(state.lastCheckpoint?.distanceMeters, 5000);
  assert.notEqual(state.status, "finished");
});

test("FINISH without measured START does not invent an actual net time", () => {
  const state = track([checkpoint(10000, 3300), checkpoint(20000, 6600)], 7000);
  assert.equal(state.status, "finished");
  assert.equal(state.startSource, "scheduled");
  assert.equal(state.estimatedFinishSeconds, null);
});

test("Seoul half-marathon demo finishes on its GPX course without full-marathon checkpoints", () => {
 const provider = new MockTimingProvider(), now = DEMO_START + 3 * 3600 * 1000;
 const runner = provider.getRunner("012345")!;
 const records = provider.getCheckpoints(runner.bib, now);
 assert.equal(DEMO_COURSE.points.length, 918);
 assert.equal(DEMO_COURSE.distanceMeters, 21097.5);
 assert.ok(records.every(c => c.distanceMeters <= DEMO_COURSE.distanceMeters));
 assert.equal(records.at(-1)?.name, "FINISH");
 const state = trackRunner(runner, records, DEMO_COURSE, now);
 assert.equal(state.status, "finished");
 assert.equal(state.distanceMeters, DEMO_COURSE.distanceMeters);
 assert.deepEqual(state.position, DEMO_COURSE.points.at(-1));
});
