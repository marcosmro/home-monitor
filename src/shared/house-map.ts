import { isCamera } from "./cameras";
import {
  floorSections,
  isInteriorGarage,
  location,
  type Device,
  type Preferences,
} from "./model";
export type PlanPoint = [number, number];
export interface PlanDrawing {
  bounds: [number, number, number, number];
  areas: {
    id: string;
    label: string;
    points: PlanPoint[];
    labelAt: PlanPoint;
    kind?: "outside" | "void" | "service";
    area?: string;
  }[];
  walls: string[];
  openings: {
    id: string;
    roomId: string;
    kind: "window" | "door" | "glazed-door" | "garage-door";
    a: PlanPoint;
    b: PlanPoint;
    swing?: string;
    sill?: number;
    head?: number;
    panes?: number;
  }[];
  details: string[];
}
export interface CameraHint {
  deviceId: string;
  roomId: string;
  point: PlanPoint;
  heading: number;
  confidence: "high" | "medium" | "low";
  evidence: string;
  photoId?: string;
}
export interface MapPlan {
  id: string;
  label: string;
  width: number;
  height: number;
  drawing?: PlanDrawing;
  model?: ModelGuide;
}
export interface MapRoom {
  id: string;
  planId: string;
  label: string;
  center: [number, number];
  windows: [number, number][];
  doors: [number, number][];
  matches: { room: string[]; floor?: string[]; number?: number }[];
  note?: string;
}
export interface MapProject {
  plans: MapPlan[];
  rooms: MapRoom[];
  cameraHints?: CameraHint[];
}
export interface MapPlacement {
  planId: string;
  roomId?: string;
  x: number;
  y: number;
  heading?: number;
  confirmed: boolean;
  reason: string;
}
export interface HouseMapData extends MapProject {
  placements: Record<string, MapPlacement | null>;
}
export const normalizedName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function suggestPlacements(
  devices: Device[],
  project: MapProject,
): Record<string, MapPlacement> {
  const result: Record<string, MapPlacement> = {},
    grouped = new Map<string, Device[]>();
  for (const d of devices) {
    const rooms = [d.room, d.roomEs]
      .filter(Boolean)
      .map((s) => normalizedName(s!));
    const floors = [d.floor, d.floorEs]
      .filter(Boolean)
      .map((s) => normalizedName(s!));
    const matches = project.rooms.filter((r) =>
      r.matches.some(
        (m) =>
          m.room.some((n) => rooms.includes(normalizedName(n))) &&
          (!m.floor ||
            m.floor.some((n) => floors.includes(normalizedName(n)))) &&
          (m.number === undefined || m.number === d.roomNumber),
      ),
    );
    // Ambiguous room names stay unplaced instead of choosing silently.
    if (matches.length !== 1) continue;
    const r = matches[0];
    grouped.set(r.id, [...(grouped.get(r.id) || []), d]);
  }
  for (const [roomId, ds] of grouped) {
    const r = project.rooms.find((r) => r.id === roomId)!;
    const counts = { window: 0, door: 0, other: 0 };
    ds.sort(
      (a, b) =>
        (a.mountIndex ?? 999) - (b.mountIndex ?? 999) ||
        a.id.localeCompare(b.id),
    );
    for (const d of ds) {
      const kind = d.mount || "other",
        index = counts[kind]++;
      const point =
        kind === "window"
          ? r.windows[index]
          : kind === "door"
            ? r.doors[index]
            : undefined;
      const x = point?.[0] ?? r.center[0] + ((index % 3) - 1) * 0.06;
      const y = point?.[1] ?? r.center[1] + Math.floor(index / 3) * 0.06;
      result[d.id] = {
        planId: r.planId,
        roomId,
        x: Math.max(0.02, Math.min(0.98, x)),
        y: Math.max(0.02, Math.min(0.98, y)),
        confirmed: false,
        reason: `${point ? "Suggested opening in matched room; sensor numbering does not establish the exact opening." : "Suggested room position; exact mounting point is unknown."}${r.note ? ` ${r.note}` : ""}`,
      };
    }
  }
  for (const hint of project.cameraHints || []) {
    const device = devices.find((d) => d.id === hint.deviceId && isCamera(d));
    const room = project.rooms.find((r) => r.id === hint.roomId);
    if (!device || !room) continue;
    result[device.id] = {
      planId: room.planId,
      roomId: room.id,
      x: hint.point[0],
      y: hint.point[1],
      heading: hint.heading,
      confirmed: false,
      reason: `Photo-based suggestion (${hint.confidence} confidence): ${hint.evidence}`,
    };
  }
  return result;
}
/**
 * Rooms drawn on a different plan than most of the floor the alarm files them
 * under (an attic bedroom filed under the first floor). Keyed like `roomKey`,
 * valued with that plan's label, so the room stands as its own floor section.
 */
export function planFloors(
  devices: Device[],
  project: MapProject,
): Record<string, string> {
  const places = suggestPlacements(
    devices.filter((d) => !isCamera(d)),
    { ...project, cameraHints: [] },
  );
  const floors = new Map<string, Map<string, string>>();
  for (const d of devices) {
    const planId = places[d.id]?.planId;
    if (!planId || isInteriorGarage(d)) continue;
    const rooms = floors.get(d.floorId) || new Map<string, string>();
    rooms.set(JSON.stringify([d.floorId, d.roomId]), planId);
    floors.set(d.floorId, rooms);
  }
  const result: Record<string, string> = {};
  for (const rooms of floors.values()) {
    const counts = new Map<string, number>();
    for (const planId of rooms.values())
      counts.set(planId, (counts.get(planId) || 0) + 1);
    const top = Math.max(...counts.values());
    // No clear main plan: leave the floor as the alarm reports it.
    if ([...counts.values()].filter((n) => n === top).length !== 1) continue;
    for (const [key, planId] of rooms)
      if (counts.get(planId) !== top) {
        const label = project.plans.find((p) => p.id === planId)?.label;
        if (label) result[key] = label;
      }
  }
  return result;
}
export const isExteriorPlan = (plan: MapPlan) =>
  plan.model?.scene === "exterior";
export interface FloorPlan {
  plan: MapPlan;
  /** The sensor-list floor sections drawn on this plan, in list order. */
  floors: string[];
  /** Those sections' names, or the plan's own label when it holds none. */
  title: string;
  /** Every sensor of those sections, placed on the plan or not. */
  devices: Device[];
}
/**
 * The interior plans named, ordered and counted like the sensor list. Each
 * floor section belongs to the plan most of its sensors are placed on, so a
 * plan file's own label ("Planta semi-sótano") never contradicts the list
 * ("Sótano"), and a plan that draws two floors carries both names.
 */
export function floorPlans(
  project: MapProject,
  devices: Device[],
  places: Record<string, MapPlacement | null | undefined>,
  prefs: Preferences,
): FloorPlan[] {
  const plans = project.plans.filter((p) => !isExteriorPlan(p));
  const result = plans.map((plan) => ({
    plan,
    floors: [] as string[],
    title: plan.label,
    devices: [] as Device[],
  }));
  const order = floorSections(devices, prefs);
  for (const floor of order) {
    const members = devices.filter((d) => location(d, prefs).floor === floor);
    let best: (typeof result)[number] | undefined,
      top = 0;
    for (const entry of result) {
      const n = members.filter(
        (d) => places[d.id]?.planId === entry.plan.id,
      ).length;
      if (n > top) [best, top] = [entry, n];
    }
    if (!best) continue;
    best.floors.push(floor);
    best.devices.push(...members);
  }
  for (const entry of result)
    if (entry.floors.length) entry.title = entry.floors.join(" · ");
  // Plans follow the list's floor order; ones without sensors go last.
  const rank = (e: FloorPlan) =>
    e.floors.length ? order.indexOf(e.floors[0]) : order.length;
  return result.sort((a, b) => rank(a) - rank(b));
}
/**
 * The grid (columns by rows) that draws a set of cards largest in a box:
 * every arrangement is tried and the one giving the drawings the biggest
 * common scale wins, so four portrait plans in a tall panel go 2 by 2 and
 * in a wide, short one stay in a row. `chrome` is the part of each card that
 * is not drawing (padding and caption). Undefined when even the best
 * arrangement leaves a drawing under `minSide` tall; the cards then scroll.
 */
export function bestGrid(
  sizes: [number, number][],
  box: { width: number; height: number },
  { gap = 12, chrome = [22, 66], minSide = 110 } = {},
) {
  let best: { cols: number; rows: number } | undefined,
    top = 0;
  for (let cols = 1; cols <= sizes.length; cols++) {
    const rows = Math.ceil(sizes.length / cols);
    const w = (box.width - gap * (cols - 1)) / cols - chrome[0],
      h = (box.height - gap * (rows - 1)) / rows - chrome[1];
    if (w <= 0 || h < minSide) continue;
    const scale = Math.min(
      ...sizes.map(([sw, sh]) => Math.min(w / sw, h / sh)),
    );
    if (scale > top) [best, top] = [{ cols, rows }, scale];
  }
  return best;
}
export function validatePlacement(
  value: MapPlacement | null,
  project: MapProject,
) {
  if (value === null) return null;
  if (
    !value ||
    !project.plans.some((p) => p.id === value.planId) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    (value.heading !== undefined &&
      (!Number.isFinite(value.heading) ||
        value.heading < 0 ||
        value.heading >= 360)) ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1 ||
    (value.roomId !== undefined &&
      !project.rooms.some(
        (r) => r.id === value.roomId && r.planId === value.planId,
      ))
  )
    throw new Error("Invalid map location.");
  return {
    planId: value.planId,
    roomId: value.roomId,
    x: value.x,
    y: value.y,
    ...(value.heading !== undefined ? { heading: value.heading } : {}),
    confirmed: true,
    reason: "Location confirmed or edited locally.",
  };
}

export interface VideoReview {
  seconds: number;
  until?: number;
  title: string;
  finding: string;
  status: "supported" | "review" | "unknown";
}
export interface ModelGuide {
  scene?: "interior" | "exterior";
  // Structural points use drawing X/Z pixels and vertical Y metres.
  surfaces?: {
    label: string;
    points: [number, number, number][];
    kind: "roof" | "ceiling" | "wall" | "glass" | "terrain";
    color: string;
  }[];
  rails?: {
    a: [number, number, number];
    b: [number, number, number];
    height: number;
    style: "glass" | "metal";
  }[];
  posts?: {
    point: PlanPoint;
    base: number;
    top: number;
    width: number;
    color: string;
  }[];
  ceilingProfiles?: {
    areaId: string;
    axis: "x" | "y";
    start: number;
    end: number;
    low: number;
    high: number;
  }[];
  photoReview?: {
    title: string;
    finding: string;
    sources: string[];
    status: "supported" | "review" | "unknown";
  }[];
  pixelsPerMetre: number;
  defaultHeight: number;
  excludedAreas?: string[];
  areaLevels?: Record<string, number>;
  areaHeights?: Record<string, number>;
  stairs?: {
    x: number;
    y: number;
    width: number;
    depth: number;
    from: number;
    to: number;
    steps: number;
  }[];
  fixtures?: {
    label: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    base: number;
    height: number;
    color: string;
  }[];
  notes: string[];
  review: VideoReview[];
}
