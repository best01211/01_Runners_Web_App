export type TemplatePaceGroup = { paceSeconds: number; distanceKm: number };
export type RegularRunTemplate = {
  template_id: string;
  name: string;
  description: string;
  location: string;
  capacity: number | null;
  image_url: string | null;
  deleted_at: string | null;
  pace_groups?: TemplatePaceGroup[];
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseRegularTemplate(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const capacity = body.capacity === "" || body.capacity == null ? null : Number(body.capacity);
  const paceGroups = parsePaceGroups(body.paceGroups ?? []);
  if (!paceGroups) return null;
  if (name.length < 2 || name.length > 100 || location.length < 2 || location.length > 200 || description.length > 10000 || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000))) return null;
  return { name, location, description, capacity, pace_groups: paceGroups };
}

export function parsePaceGroups(groups: unknown): TemplatePaceGroup[] | null {
  if (!Array.isArray(groups) || groups.length > 20) return null;
  const paceGroups: TemplatePaceGroup[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group || typeof group !== "object" || typeof group.paceSeconds !== "number" || typeof group.distanceKm !== "number") return null;
    const { paceSeconds, distanceKm } = group;
    if (!Number.isInteger(paceSeconds) || paceSeconds <= 0 || paceSeconds > 2147483647 || paceSeconds % 30 || !Number.isInteger(distanceKm) || distanceKm < 5 || distanceKm > 2147483647) return null;
    const key = `${paceSeconds}:${distanceKm}`;
    if (seen.has(key)) return null;
    seen.add(key); paceGroups.push({ paceSeconds, distanceKm });
  }
  return paceGroups;
}
