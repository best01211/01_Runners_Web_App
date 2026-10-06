import type { Coordinate, Course } from "./types";

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude);
  const lng = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) * Math.sin(lng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function buildCourse(points: Coordinate[], distanceMeters?: number): Course {
  if (points.length < 2 || points.some(p => !Number.isFinite(p.latitude) ||
    !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) {
    throw new Error("코스에는 유효한 좌표가 두 개 이상 필요합니다.");
  }
  const cumulativeMeters = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeMeters.push(cumulativeMeters[i - 1] + distanceBetween(points[i - 1], points[i]));
  }
  const measuredMeters = cumulativeMeters.at(-1)!;
  if (measuredMeters <= 0 || (distanceMeters !== undefined &&
    (!Number.isFinite(distanceMeters) || distanceMeters <= 0))) throw new Error("코스 거리가 올바르지 않습니다.");
  return { points: points.map(p => ({ ...p })), cumulativeMeters, measuredMeters,
    distanceMeters: distanceMeters ?? measuredMeters };
}

export function positionAtDistance(course: Course, distanceMeters: number): Coordinate {
  if (!Number.isFinite(distanceMeters)) throw new Error("예상 거리가 올바르지 않습니다.");
  const distance = Math.max(0, Math.min(course.distanceMeters, distanceMeters)) *
    course.measuredMeters / course.distanceMeters;
  if (distance === 0) return { ...course.points[0] };
  if (distance >= course.measuredMeters) return { ...course.points.at(-1)! };
  let low = 0, high = course.points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (course.cumulativeMeters[middle] <= distance) low = middle;
    else high = middle;
  }
  const span = course.cumulativeMeters[high] - course.cumulativeMeters[low];
  const ratio = span > 0 ? (distance - course.cumulativeMeters[low]) / span : 0;
  const a = course.points[low], b = course.points[high];
  return { latitude: a.latitude + (b.latitude - a.latitude) * ratio,
    longitude: a.longitude + (b.longitude - a.longitude) * ratio };
}

// GeoJSON uses longitude, latitude. Internally use named fields to avoid swaps.
export function courseFromGeoJSON(value: unknown, distanceMeters?: number): Course {
  if (!value || typeof value !== "object") throw new Error("GeoJSON이 올바르지 않습니다.");
  const object = value as { type?: string; geometry?: unknown; coordinates?: unknown };
  if (object.type === "Feature") return courseFromGeoJSON(object.geometry, distanceMeters);
  if (object.type !== "LineString" || !Array.isArray(object.coordinates)) {
    throw new Error("단일 LineString 코스를 사용해주세요.");
  }
  return buildCourse(object.coordinates.map((point: unknown) => {
    if (!Array.isArray(point) || point.length < 2 || typeof point[0] !== "number" ||
      typeof point[1] !== "number") throw new Error("GeoJSON 좌표가 올바르지 않습니다.");
    return { longitude: point[0], latitude: point[1] };
  }), distanceMeters);
}

// Browser-side GPX import. Reject disconnected tracks instead of joining gaps.
export function courseFromGPX(xml: string, distanceMeters?: number): Course {
  if (/<!DOCTYPE/i.test(xml)) throw new Error("외부 문서 선언이 없는 GPX를 사용해주세요.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "gpx") {
    throw new Error("GPX 파일을 읽을 수 없습니다.");
  }
  const segments = Array.from(doc.getElementsByTagNameNS("*", "trkseg"));
  if (segments.length !== 1) throw new Error("하나의 연속된 트랙 구간을 사용해주세요.");
  const points = Array.from(segments[0].getElementsByTagNameNS("*", "trkpt"));
  return buildCourse(points.map(p => ({
    latitude: p.getAttribute("lat")?.trim() ? Number(p.getAttribute("lat")) : NaN,
    longitude: p.getAttribute("lon")?.trim() ? Number(p.getAttribute("lon")) : NaN,
  })), distanceMeters);
}
