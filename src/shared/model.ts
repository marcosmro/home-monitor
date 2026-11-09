import type { Climate } from "./climate";
export type Mode = "armed" | "partial" | "disarmed" | "unknown";
export type Action = "arm" | "partialArm" | "disarm";
export type Phase =
  "idle" | "sending" | "awaiting" | "confirmed" | "failed" | "unknown";
export interface Device {
  id: string;
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
  source: "contacts" | "telemetry" | "cameras" | "smoke" | "flood";
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
export interface Event {
  id: string;
  type: string;
  time?: string;
  localTime?: string;
  user?: string;
  deviceId?: string;
  description: string;
}
export interface Snapshot {
  climate?: Climate;
  demo: boolean;
  panelId: string;
  name: string;
  vendor: string;
  online?: boolean;
  mode: Mode;
  areas: Area[];
  devices: Device[];
  events: Event[];
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
  theme: "light" | "dark" | "system";
  density: "compact" | "comfortable";
  names: "original" | "spanish";
  aliases: Record<
    string,
    { name?: string; spanish?: string; floor?: string; room?: string }
  >;
}
export const defaults: Preferences = {
  theme: "light",
  density: "compact",
  names: "spanish",
  aliases: {},
};
export interface Bridge {
  snapshot(): Promise<Snapshot>;
  demo(): Promise<Snapshot>;
  refresh(): Promise<Snapshot>;
  login(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<Array<{ id: string; name: string }>>;
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
export function location(d: Device, p: Preferences) {
  const a = p.aliases[d.id];
  return {
    floor:
      a?.floor || (p.names === "spanish" ? d.floorEs : undefined) || d.floor,
    room: a?.room || (p.names === "spanish" ? d.roomEs : undefined) || d.room,
  };
}
export function age(at?: string, now = Date.now()) {
  return at && Number.isFinite(Date.parse(at))
    ? Math.max(0, now - Date.parse(at))
    : Infinity;
}
export function deviceState(d: Device) {
  if (d.alarm === true) return "Alarm";
  if (d.offline === true) return "Last known";
  if (d.closed === true) return "Closed";
  if (d.closed === false) return "Open";
  return "Not reported";
}
export function deviceHealth(d: Device) {
  if (d.offline) return "Offline";
  if (d.batteryCritical) return "Critical battery";
  if (d.batteryLow) return "Low battery";
  if (d.bypass) return "Bypassed";
  if (d.active === false) return "Inactive";
  if (d.offline === false && d.batteryLow === false) return "OK";
  return "Unknown";
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
