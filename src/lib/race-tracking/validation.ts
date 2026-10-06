import { buildCourse } from "./course";
import type { Coordinate } from "./types";

export type RaceWrite =
 | { action: "course"; name: string; distanceMeters: number; points: Coordinate[]; startAt: string }
 | { action: "entry"; userId: string; bib: string; targetPaceSeconds: number | null }
 | { action: "checkpoint"; entryId: string; name: string; distanceMeters: number; passedAt: string }
 | { action: "status"; entryId: string; status: "running" | "dnf" | "dns" };
export const isUUID = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const time = (value: unknown) => {
 if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("시간 형식이 올바르지 않습니다.");
 return new Date(value).toISOString();
};
const number = (value: unknown, min: number, max: number) => {
 if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("숫자 범위를 확인해주세요.");
 return value;
};
const text = (value: unknown, max: number) => {
 if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error("입력 내용을 확인해주세요.");
 return value.trim();
};
export function validateRaceWrite(value: unknown): RaceWrite {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("요청 형식이 올바르지 않습니다.");
 const b = value as Record<string, unknown>;
 if (b.action === "course") {
  if (!Array.isArray(b.points) || b.points.length > 20000) throw new Error("코스 좌표는 최대 20,000개입니다.");
  const points = b.points.map(p => {
   if (!p || typeof p !== "object") throw new Error("좌표가 올바르지 않습니다.");
   return { latitude: number(p.latitude, -90, 90), longitude: number(p.longitude, -180, 180) };
  });
  const distanceMeters = number(b.distanceMeters, 1000, 100000);
  buildCourse(points, distanceMeters);
  return { action: "course", name: text(b.name, 100), points, distanceMeters, startAt: time(b.startAt) };
 }
 if (b.action === "entry") {
  if (!isUUID(b.userId)) throw new Error("회원을 선택해주세요.");
  const bib = text(b.bib, 20);
  if (!/^[A-Za-z0-9-]+$/.test(bib)) throw new Error("배번호는 영문·숫자·하이픈만 사용할 수 있습니다.");
  const pace = b.targetPaceSeconds === null ? null : number(b.targetPaceSeconds, 120, 1200);
  if (pace !== null && !Number.isInteger(pace)) throw new Error("페이스는 정수 초로 입력해주세요.");
  return { action: "entry", userId: b.userId, bib, targetPaceSeconds: pace };
 }
 if (!isUUID(b.entryId)) throw new Error("출전 선수를 선택해주세요.");
 if (b.action === "status" && ["running","dnf","dns"].includes(String(b.status))) return { action: "status", entryId: b.entryId, status: b.status as "running" | "dnf" | "dns" };
 if (b.action === "checkpoint") return { action: "checkpoint", entryId: b.entryId, name: text(b.name, 40), distanceMeters: number(b.distanceMeters, 0, 100000), passedAt: time(b.passedAt) };
 throw new Error("올바르지 않은 요청입니다.");
}
