import type { Device, Area, Mode, Event } from "./model";
import { PLACE_NAMES, COMPONENT_NAMES } from "./places";
import { finiteTemperature } from "./climate";
import { instant } from "./time";
type Obj = Record<string, any>;
export const obj = (x: unknown): Obj =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {};
const str = (x: unknown, fallback = "") =>
  typeof x === "string" && x.trim() ? x : fallback;
const bool = (x: unknown) => (typeof x === "boolean" ? x : undefined);
export function panelList(raw: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(raw))
    throw new Error(
      "Sector Alarm returned an unrecognized property-list format.",
    );
  if (!raw.length)
    throw new Error(
      "Sign-in succeeded, but Sector Alarm returned no properties for this account. Check that the same account shows your home in the official app.",
    );
  const panels = new Map<string, { id: string; name: string }>();
  for (const item of raw) {
    const p = obj(item);
    const id =
      typeof p.PanelId === "string"
        ? p.PanelId.trim()
        : typeof p.PanelId === "number" && Number.isFinite(p.PanelId)
          ? String(p.PanelId)
          : "";
    if (!id) continue;
    // InstallationStatus is not required by the reference client. Listing an
    // accessible property does not assert it is active or authorize commands.
    panels.set(id, {
      id,
      name: str(p.DisplayName, str(p.Label, str(p.Name, "Home"))),
    });
  }
  if (!panels.size)
    throw new Error(
      "Sector Alarm returned property entries, but none contained a usable PanelId. The response format needs investigation.",
    );
  return [...panels.values()];
}
export function mode(x: unknown): Mode {
  // These aliases and numeric strings are accepted by the working reference.
  const value =
    typeof x === "string" ? x.trim().toLowerCase().replace(/[\s_]/g, "") : x;
  if (
    value === 3 ||
    ["3", "armedtotal", "armed", "armedaway", "total", "totalarmed"].includes(
      value as string,
    )
  )
    return "armed";
  if (
    value === 2 ||
    ["2", "armedpartial", "partialarmed", "armedhome", "partial"].includes(
      value as string,
    )
  )
    return "partial";
  if (value === 1 || value === "1" || value === "disarmed") return "disarmed";
  return "unknown";
}
export function state(raw: unknown): {
  online?: boolean;
  areas: Area[];
  mode: Mode;
} {
  const r = obj(raw);
  const areas: Area[] = Array.isArray(r.areas)
    ? r.areas
        .filter(
          (a: any) =>
            a &&
            (typeof a.id === "number" ||
              (typeof a.id === "string" && a.id.trim() !== "")) &&
            Number.isInteger(Number(a.id)),
        )
        .map((a: any) => ({
          id: Number(a.id),
          reportedMode:
            typeof a.state === "string" || typeof a.state === "number"
              ? a.state
              : undefined,
          name: str(a.friendlyName, str(a.name, "Area")),
          mode: mode(a.state),
          partial: a.canPartialArm === true,
          changedAt: instant(a.stateLastChangedAtUtc),
        }))
    : [
        {
          id: 0,
          name: "Main area",
          mode: mode(r.Status),
          partial: false,
          changedAt: instant(r.StatusTimeUtc),
        },
      ];
  return {
    online: bool(r.isOnline ?? r.IsOnline),
    areas,
    mode:
      areas.length === 1
        ? areas[0].mode
        : areas.every((a) => a.mode === areas[0]?.mode)
          ? areas[0]?.mode || "unknown"
          : "unknown",
  };
}
// Only a complete documented identity tuple may connect an event to a sensor.
export function sensorReference(...parts: unknown[]): string | undefined {
  return parts.every(
    (p) => (typeof p === "string" && p.length > 0) || typeof p === "number",
  )
    ? JSON.stringify(parts)
    : undefined;
}
// MountTypeDto values in the reference app: DOOR=0, WINDOW=1.
export function mountType(value: unknown): "door" | "window" | undefined {
  if (
    value === 0 ||
    (typeof value === "string" &&
      ["DOOR", "0"].includes(value.trim().toUpperCase()))
  )
    return "door";
  if (
    value === 1 ||
    (typeof value === "string" &&
      ["WINDOW", "1"].includes(value.trim().toUpperCase()))
  )
    return "window";
  return undefined;
}
function mountIndex(value: unknown): number | undefined {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim()))
    return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
const genericDeviceNames = new Set([
  "contact and shock detector",
  "contact & shock detector",
  "camera motion detector",
  "motion detector",
  "smoke detector",
  "flood detector",
  "keypad",
  "siren",
  "magnetic contact",
]);
function spanishDeviceName(c: Obj, floor: Obj, room: Obj): string | undefined {
  const name = str(c.name).trim().toLocaleLowerCase();
  const floors = [
    floor.name,
    floor.friendlyName,
    PLACE_NAMES[floor.translationKey ?? floor.key],
  ].filter((x) => typeof x === "string" && x.trim());
  const rooms = [
    room.name,
    room.friendlyName,
    PLACE_NAMES[room.translationKey ?? room.key],
  ].filter((x) => typeof x === "string" && x.trim());
  const locationOnly = floors.some((f) =>
    rooms.some((r) => `${f} ${r}`.trim().toLocaleLowerCase() === name),
  );
  // Only exact known generic labels/location composites, never partial matches
  // inside a user-assigned name. The raw original remains accessible.
  if (name && !genericDeviceNames.has(name) && !locationOnly) return undefined;
  const mount = mountType(c.mountType);
  if (mount) {
    const index = mountIndex(c.mountIndex);
    return `${mount === "window" ? "Ventana" : "Puerta"}${index !== undefined ? ` ${index}` : ""}`;
  }
  return COMPONENT_NAMES[c.typeName];
}
export function plan(
  raw: unknown,
  source: Device["source"],
  at: string,
): Device[] {
  const r = obj(raw);
  if (!Array.isArray(r.areas) && !Array.isArray(r.sections))
    throw new Error("The sensor response was not a documented property plan.");
  const out: Device[] = [];
  for (const a of r.areas ?? [{ sections: r.sections }])
    for (const f of a.sections || [])
      for (const room of f.places || [])
        for (const c of room.components || []) {
          if (!c.serialNumber) continue;
          const i = obj(c.info);
          const original = str(c.name, str(c.typeName, "Unnamed sensor"));
          out.push({
            id: String(c.serialNumber),
            eventReference: sensorReference(
              c.typeName,
              mountType(c.mountType),
              c.mountIndex,
              f.translationKey,
              room.translationKey,
              room.placeNumber,
            ),
            mount: mountType(c.mountType),
            mountIndex: mountIndex(c.mountIndex),
            reportedMount:
              typeof c.mountType === "string" || typeof c.mountType === "number"
                ? c.mountType
                : undefined,
            original,
            spanish: spanishDeviceName(c, f, room),
            type: str(c.typeName, "Unknown"),
            floorId: String(f.id ?? f.translationKey ?? "unplaced"),
            floor: str(f.friendlyName, str(f.name, "Unassigned")),
            floorEs: str(f.friendlyName, PLACE_NAMES[f.translationKey]),
            roomId: String(room.id ?? room.translationKey ?? "unplaced"),
            room: str(room.friendlyName, str(room.name, "Unassigned")),
            roomEs: str(room.friendlyName, PLACE_NAMES[room.translationKey]),
            roomNumber:
              typeof room.placeNumber === "number"
                ? room.placeNumber
                : undefined,
            closed: bool(i.closed),
            alarm: bool(i.alarm),
            batteryLow: bool(i.batteryLow),
            batteryCritical: bool(i.batteryCritical),
            offline: bool(i.supervision ?? i.supervisionAlarm),
            bypass: bool(i.bypass),
            active: bool(i.active),
            temperature: finiteTemperature(i.temperature),
            temperatureFetchedAt:
              finiteTemperature(i.temperature) !== undefined ? at : undefined,
            changedAt: instant(i.lastChanged),
            fetchedAt: at,
            source,
          });
        }
  return out;
}
export function mergeDevices(
  contacts: Device[],
  telemetry: Device[],
): Device[] {
  const m = new Map<string, Device>();
  for (const d of [...contacts, ...telemetry]) {
    const prev = m.get(d.id);
    if (!prev) {
      m.set(d.id, d);
      continue;
    }
    const defined = Object.fromEntries(
      Object.entries(d).filter(([, v]) => v !== undefined),
    );
    m.set(d.id, {
      ...prev,
      ...defined,
      mount: prev.mount ?? d.mount,
      mountIndex: prev.mountIndex ?? d.mountIndex,
      reportedMount: prev.reportedMount ?? d.reportedMount,
      original: prev.original,
      spanish: prev.spanish,
      type: ["Temperature", "Unknown"].includes(prev.type) ? d.type : prev.type,
      floorId: prev.floorId === "unassigned" ? d.floorId : prev.floorId,
      floor: prev.floor === "Unassigned" ? d.floor : prev.floor,
      floorEs: prev.floorEs || d.floorEs,
      roomId: prev.roomId === "unassigned" ? d.roomId : prev.roomId,
      room: prev.room === "Unassigned" ? d.room : prev.room,
      roomEs: prev.roomEs || d.roomEs,
      roomNumber: prev.roomNumber ?? d.roomNumber,
      source: prev.source,
      closed: prev.closed ?? d.closed,
      alarm: prev.alarm ?? d.alarm,
      changedAt: prev.changedAt ?? d.changedAt,
      fetchedAt:
        Date.parse(prev.fetchedAt) < Date.parse(d.fetchedAt)
          ? prev.fetchedAt
          : d.fetchedAt,
      stale: prev.stale || d.stale,
    });
  }
  return [...m.values()];
}
const descriptions: Record<string, string> = {
  armed: "System fully armed",
  partialarmed: "System partially armed",
  disarmed: "System disarmed",
  lowbattery: "Low sensor battery",
  batterylow: "Low sensor battery",
  internetlost: "Internet connection lost",
  internetrestored: "Internet connection restored",
  mains: "Mains power lost",
  mainsrestored: "Mains power restored",
  batterystatusrestored: "Sensor battery restored",
};
export function logs(raw: unknown, devices: Device[] = []): Event[] {
  const r = obj(raw);
  if (!Array.isArray(r.Records))
    throw new Error("The activity response was not recognized.");
  return r.Records.map((e: any, n: number) => {
    const info = obj(e.SensorInformation);
    const ref = sensorReference(
      info.DeviceType,
      mountType(info.MountType),
      info.MountIndex,
      info.SectionKey,
      info.PlaceKey,
      info.PlaceIndex,
    );
    const matches = ref ? devices.filter((d) => d.eventReference === ref) : [];
    return {
      deviceId: matches.length === 1 ? matches[0].id : undefined,
      id: `${e.Time}-${e.EventType}-${n}`,
      type: str(e.EventType, "unknown"),
      description:
        descriptions[str(e.EventType).toLowerCase().replace(/[-_]/g, "")] ||
        str(e.EventType, "Unrecognized event"),
      time: instant(e.Time),
      localTime:
        !instant(e.Time) && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.Time)
          ? e.Time
          : undefined,
      user: str(e.User) || undefined,
    };
  });
}

/** The reference client's two legacy hierarchy shapes, preserving unknowns.
 * Numeric legacy Type is not mapped: its meaning varies between endpoints. */
export function legacyPlan(
  raw: unknown,
  source: Device["source"],
  at: string,
  fallbackType: string,
): Device[] {
  const root = obj(raw);
  const list = Array.isArray(raw) ? raw : (root.Floors ?? root.Sections);
  if (!Array.isArray(list))
    throw new Error("The legacy sensor response format was not recognized.");
  const out: Device[] = [];
  const asId = (x: unknown) =>
    typeof x === "string"
      ? x.trim()
      : typeof x === "number" && Number.isFinite(x)
        ? String(x)
        : "";
  const legacyBool = (x: unknown) =>
    typeof x === "boolean"
      ? x
      : x === 1 || x === "true" || x === "1"
        ? true
        : x === 0 || x === "false" || x === "0"
          ? false
          : undefined;
  const add = (value: unknown, floor: Obj = {}, room: Obj = {}) => {
    const d = obj(value);
    const serial = asId(
      d.SerialNo ?? d.SerialString ?? d.Serial ?? d.serialNumber,
    );
    const id = serial || (asId(d.Id) ? `${source}:id:${asId(d.Id)}` : "");
    if (!id)
      throw new Error(
        "A sensor has no documented identifier; inventory may be incomplete.",
      );
    const rawTemperature = d.Temperature ?? d.Temprature;
    const temperature =
      rawTemperature === null ||
      rawTemperature === undefined ||
      rawTemperature === ""
        ? undefined
        : Number(String(rawTemperature).replace(",", "."));
    out.push({
      id,
      original: str(d.Label, str(d.Name, fallbackType)),
      mount: mountType(d.MountType),
      mountIndex: mountIndex(d.MountIndex),
      reportedMount:
        typeof d.MountType === "string" || typeof d.MountType === "number"
          ? d.MountType
          : undefined,
      type: str(d.TypeName, fallbackType),
      floorId: asId(floor.Id ?? floor.Key) || str(floor.Name, "unassigned"),
      floor: str(floor.FriendlyName, str(floor.Name, "Unassigned")),
      floorEs: str(floor.FriendlyName, PLACE_NAMES[floor.Key]),
      roomId: asId(room.Id ?? room.Key) || str(room.Name, "unassigned"),
      room: str(room.FriendlyName, str(room.Name, "Unassigned")),
      roomEs: str(room.FriendlyName, PLACE_NAMES[room.Key]),
      closed: legacyBool(d.Closed),
      alarm: legacyBool(d.Alarm),
      batteryLow: legacyBool(d.LowBattery ?? d.BatteryLow),
      temperature:
        temperature !== undefined && Number.isFinite(temperature)
          ? temperature
          : undefined,
      temperatureFetchedAt:
        temperature !== undefined && Number.isFinite(temperature)
          ? at
          : undefined,
      changedAt: instant(d.LastChanged),
      source,
      fetchedAt: at,
    });
  };
  for (const item of list) {
    const floor = obj(item);
    const rooms = floor.Rooms ?? floor.Places;
    if (Array.isArray(rooms))
      for (const entry of rooms) {
        const room = obj(entry);
        const devices = room.Devices ?? room.Components;
        if (!Array.isArray(devices))
          throw new Error(
            "The legacy room response has no recognized sensor list.",
          );
        for (const d of devices) add(d, floor, room);
      }
    else if (source === "contacts")
      throw new Error("The legacy contact hierarchy was not recognized.");
    else add(item);
  }
  return out;
}
