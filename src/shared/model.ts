import { PLACE_NAMES } from "./places";
import { inOrder } from "./order";
import type { HouseMapData, MapPlacement } from "./house-map";
import type { CaptureJob, PhotoPage } from "./cameras";
import type { PhotoChanges } from "./photo-changes";
import type { Climate } from "./climate";
import type { InferredOutage } from "./outages";
export type Mode = "armed" | "partial" | "disarmed" | "unknown";
export type Action = "arm" | "partialArm" | "disarm";
export type Phase =
  "idle" | "sending" | "awaiting" | "confirmed" | "failed" | "unknown";
export interface Device {
  id: string;
  plugState?: "on" | "off" | "unknown";
  timerActive?: boolean;
  manufacturer?: string;
  cameraRoute?: "modern" | "legacy";
  legacyCameraId?: string;
  original: string;
  eventReference?: string;
  mount?: "door" | "window";
  mountIndex?: number;
  reportedMount?: string | number;
  spanish?: string;
  type: string;
  floorId: string;
  floor: string;
  floorEs?: string;
  roomId: string;
  room: string;
  roomEs?: string;
  roomNumber?: number;
  closed?: boolean;
  alarm?: boolean;
  batteryLow?: boolean;
  batteryCritical?: boolean;
  offline?: boolean;
  bypass?: boolean;
  active?: boolean;
  temperature?: number;
  temperatureFetchedAt?: string;
  temperatureStale?: boolean;
  changedAt?: string;
  fetchedAt: string;
  source:
    "contacts" | "telemetry" | "cameras" | "smoke" | "flood" | "smartplugs";
  stale?: boolean;
}
export interface Area {
  reportedMode?: string | number;
  id: number;
  name: string;
  mode: Mode;
  partial: boolean;
  changedAt?: string;
}
export interface KeyTagPerson {
  name: string;
  firstName: string;
  color?: "black" | "blue" | "green" | "red" | "yellow";
}
export interface Event {
  id: string;
  type: string;
  time?: string;
  localTime?: string;
  user?: string;
  channel?: string;
  deviceId?: string;
  description: string;
}
export interface Snapshot {
  requestBudget?: {
    used: number;
    limit: number;
    override: boolean;
    localPaused: boolean;
    serverPaused: boolean;
    resetsAt: string;
  };
  climate?: Climate;
  /** Power cuts inferred locally from reachability, newest first. */
  inferredOutages?: InferredOutage[];
  demo: boolean;
  panelId: string;
  name: string;
  vendor: string;
  online?: boolean;
  mode: Mode;
  areas: Area[];
  devices: Device[];
  events: Event[];
  keyTagPeople?: KeyTagPerson[];
  totalEvents: number;
  statusAt?: string;
  contactsAt?: string;
  telemetryAt?: string;
  eventsAt?: string;
  warnings: Record<string, string>;
  readOnly: boolean;
  codeLength: number;
  command: { phase: Phase; message: string; at?: string };
  requests: number;
}
export interface Preferences {
  temperatureRange?: { min: number; max: number };
  lastPanelId?: string;
  /** Key of the finished power outage whose notice was dismissed. */
  dismissedPower?: string;
  /** Start time of the inferred power cut whose notice was dismissed. */
  dismissedInferredCut?: string;
  homeNames?: Record<string, string>;
  language?: "en" | "es";
  theme: "light" | "dark" | "system";
  density: "compact" | "comfortable";
  names: "original" | "spanish";
  aliases: Record<string, DeviceAlias>;
  /**
   * Local floor group for a whole inventory room, keyed like `roomKey`. Lets a
   * room the alarm files under another floor (an interior garage under the
   * basement) stand as its own floor; new sensors in that room follow it.
   */
  roomFloors?: Record<string, string>;
  /** Floor sections of the sensor list, by displayed name, in the chosen order. */
  floorOrder?: string[];
  /** Room rows of the sensor list (`roomGroupKey`), in the chosen order. */
  roomOrder?: string[];
}
/**
 * Local overrides for one device. `floor`/`room` are free-text groups; the
 * `place*` fields assign the device to an existing inventory room (used for
 * smart plugs, which report no room), so it joins that room's row and map.
 */
export interface DeviceAlias {
  name?: string;
  spanish?: string;
  floor?: string;
  room?: string;
  placeFloorId?: string;
  placeRoomId?: string;
  placeFloor?: string;
  placeFloorEs?: string;
  placeRoom?: string;
  placeRoomEs?: string;
}
export const defaults: Preferences = {
  language: "en",
  theme: "light",
  density: "compact",
  names: "spanish",
  aliases: {},
};
export interface Bridge {
  resetZoom?(): Promise<void>;
  houseMap(): Promise<HouseMapData>;
  mapImage(id: string): Promise<string>;
  saveMapPlacement(
    deviceId: string,
    placement: MapPlacement | null,
  ): Promise<void>;
  setBudgetOverride(enabled: boolean): Promise<Snapshot>;
  cameraState(): Promise<CaptureJob>;
  captureCameras(ids: string[]): Promise<CaptureJob>;
  cancelCapture(): Promise<CaptureJob>;
  photoLibrary(offset?: number, cameraId?: string): Promise<PhotoPage>;
  photoImage(id: string): Promise<string>;
  /** Compares a saved photo with its camera's previous one, once, locally. */
  photoChanges(id: string): Promise<PhotoChanges | null>;
  deletePhoto(id: string): Promise<void>;
  exportPhoto(id: string): Promise<void>;
  snapshot(): Promise<Snapshot>;
  demo(): Promise<Snapshot>;
  refresh(): Promise<Snapshot>;
  login(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<Array<{ id: string; name: string }>>;
  savedAccount(): Promise<{ email: string } | null>;
  savedLogin(): Promise<Array<{ id: string; name: string }>>;
  select(id: string): Promise<Snapshot>;
  logout(): Promise<Snapshot>;
  command(action: Action, code: string, area: number): Promise<Snapshot>;
  reconcile(): Promise<Snapshot>;
  readOnly(value: boolean): Promise<Snapshot>;
  preferences(): Promise<Preferences>;
  savePreferences(p: Preferences): Promise<void>;
  scenario(name: string): Promise<Snapshot>;
  subscribe(cb: (s: Snapshot) => void): () => void;
}
export const modeLabel: Record<Mode, string> = {
  armed: "Fully armed",
  partial: "Partially armed",
  disarmed: "Disarmed",
  unknown: "Unknown state",
};
export function displayDevice(d: Device, p: Preferences) {
  const a = p.aliases[d.id];
  return (
    (p.names === "spanish" ? a?.spanish || d.spanish : undefined) ||
    a?.name ||
    d.original
  );
}
/** The device with any locally assigned inventory room applied. */
export function placedDevice(d: Device, p: Preferences): Device {
  const a = p.aliases[d.id];
  if (!a?.placeFloorId || !a.placeRoomId) return d;
  return {
    ...d,
    floorId: a.placeFloorId,
    roomId: a.placeRoomId,
    floor: a.placeFloor || d.floor,
    floorEs: a.placeFloorEs,
    room: a.placeRoom || d.room,
    roomEs: a.placeRoomEs,
  };
}
/**
 * The alarm files an interior garage as a room of whichever floor it was
 * added to (here the basement), yet it is a level of its own. It gets its own
 * section, named after the room, unless a local floor group says otherwise.
 */
export const isInteriorGarage = (d: Device) =>
  d.roomId === "INDOOR_GARAGE_PLACE" ||
  d.roomEs === PLACE_NAMES.INDOOR_GARAGE_PLACE ||
  /^indoor garage$/i.test(d.room.trim());
export function location(d: Device, p: Preferences) {
  const a = p.aliases[d.id];
  const placed = placedDevice(d, p);
  const room =
    a?.room ||
    (p.names === "spanish" ? placed.roomEs : undefined) ||
    placed.room;
  return {
    floor:
      a?.floor ||
      p.roomFloors?.[JSON.stringify([placed.floorId, placed.roomId])] ||
      (isInteriorGarage(placed) ? room : undefined) ||
      (p.names === "spanish" ? placed.floorEs : undefined) ||
      placed.floor,
    room,
  };
}
/**
 * The floor sections of the sensor list, by displayed name, in the saved
 * order. The one source for floor names and their order everywhere.
 */
export function floorSections(devices: Device[], p: Preferences) {
  return inOrder(
    [...new Set(devices.map((d) => location(d, p).floor))],
    (floor) => floor,
    p.floorOrder,
  );
}
/** True when the device reports no room of its own (smart plugs). */
export const reportsNoRoom = (d: Device) =>
  d.floorId === "unassigned" && d.roomId === "unassigned";
export function age(at?: string, now = Date.now()) {
  return at && Number.isFinite(Date.parse(at))
    ? Math.max(0, now - Date.parse(at))
    : Infinity;
}
export function deviceState(d: Device) {
  if (d.alarm === true) return "Alarm";
  if (d.offline === true) return "Last known";
  if (d.plugState)
    return d.plugState === "on"
      ? "On"
      : d.plugState === "off"
        ? "Off"
        : "Unknown";
  if (d.closed === true) return "Closed";
  if (d.closed === false) return "Open";
  return "Not reported";
}
export function deviceHealth(d: Device) {
  if (d.offline) return "Offline";
  if (d.type === "SmartPlug" && d.offline === false) return "Connected";
  if (d.batteryCritical) return "Critical battery";
  if (d.batteryLow) return "Low battery";
  if (d.bypass) return "Bypassed";
  if (d.active === false) return "Inactive";
  if (d.offline === false && d.batteryLow === false) return "OK";
  return "Unknown";
}
/** Healthy for display: sensors report OK, smart plugs report connected. */
export function isHealthy(d: Device) {
  const health = deviceHealth(d);
  return health === "OK" || health === "Connected";
}
export function needsAttention(d: Device) {
  return !!(
    d.alarm ||
    d.offline ||
    d.batteryLow ||
    d.batteryCritical ||
    d.bypass ||
    d.active === false
  );
}

/**
 * The one colour decision for a sensor, shared by the list, the floor plan and
 * the 3D model. Colour is reserved for what matters: "open" (orange), an open
 * contact while fully armed and a reported alarm (red). Health issues stay
 * quiet, and everything else is neutral.
 */
export type DeviceTone =
  | "alarm"
  | "open-armed"
  | "open"
  | "attention"
  | "unknown"
  | "healthy"
  | "neutral";
export function deviceTone(
  d: Device,
  context: { stale?: boolean; armed?: boolean } = {},
): DeviceTone {
  if (d.alarm) return "alarm";
  if (d.offline || context.stale) return "unknown";
  if (d.closed === false && !d.plugState)
    return context.armed ? "open-armed" : "open";
  if (needsAttention(d)) return "attention";
  return isHealthy(d) ? "healthy" : "neutral";
}
/** Whether a reading is too old, or the panel too unreachable, to trust. */
export function deviceIsStale(
  d: Device,
  online: boolean | undefined,
  now = Date.now(),
) {
  return !!d.stale || online !== true || age(d.fetchedAt, now) > 1200000;
}
