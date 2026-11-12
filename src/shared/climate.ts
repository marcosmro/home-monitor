import type { Device, Snapshot, Preferences } from "./model";
export interface Climate {
  fetchedAt: string;
  houseAverage?: number;
  roomAverages: Record<string, number>;
}
export const roomKey = (d: Pick<Device, "floorId" | "roomId">) =>
  JSON.stringify([d.floorId, d.roomId]);
export function roomGroupKey(d: Device, p: Preferences) {
  const a = p.aliases[d.id];
  if (a?.floor || a?.room)
    return JSON.stringify(["local", a.floor || d.floorId, a.room || d.roomId]);
  // An assigned inventory room shares that room's row.
  return a?.placeFloorId && a.placeRoomId
    ? roomKey({ floorId: a.placeFloorId, roomId: a.placeRoomId })
    : roomKey(d);
}
export function finiteTemperature(value: unknown): number | undefined {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim()))
    return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
/** Preserve server aggregates independently of the device merge. */
export function climatePlan(raw: any, at: string): Climate {
  const roomAverages: Record<string, number> = {};
  for (const a of raw.areas ?? [{ sections: raw.sections }])
    for (const f of a.sections || [])
      for (const r of f.places || []) {
        const value = finiteTemperature(r.averageTemperature);
        if (value !== undefined)
          roomAverages[
            roomKey({
              floorId: String(f.id ?? f.translationKey ?? "unplaced"),
              roomId: String(r.id ?? r.translationKey ?? "unplaced"),
            })
          ] = value;
      }
  return {
    fetchedAt: at,
    houseAverage: finiteTemperature(raw.averageTemperature),
    roomAverages,
  };
}
export const temperatureText = (value?: number) =>
  value === undefined ? "—" : `${Math.round(value)}°`;
export function temperatureIsStale(d: Device, s: Snapshot, now = Date.now()) {
  const at = d.temperatureFetchedAt || d.fetchedAt;
  return (
    s.online === false ||
    d.offline === true ||
    d.active === false ||
    d.temperatureStale === true ||
    !!s.warnings.telemetry ||
    !Number.isFinite(Date.parse(at)) ||
    now - Date.parse(at) > 1200000
  );
}
export interface Average {
  value?: number;
  source: "api" | "calculated";
  used: number;
  reported: number;
  total: number;
}
/** Average every eligible physical sensor once, never averages of room averages.
 * Call with the full house/room inventory so UI filters do not change averages. */
export function averageTemperature(
  s: Snapshot,
  devices: Device[],
  now = Date.now(),
  scope: "house" | string = "house",
): Average {
  const unique = [...new Map(devices.map((d) => [d.id, d])).values()];
  const reported = unique.filter(
    (d) => finiteTemperature(d.temperature) !== undefined,
  );
  const valid = reported.filter((d) => !temperatureIsStale(d, s, now));
  const meta = s.climate;
  const apiValue =
    scope === "house" ? meta?.houseAverage : meta?.roomAverages[scope];
  const metaFresh =
    meta &&
    Number.isFinite(Date.parse(meta.fetchedAt)) &&
    now - Date.parse(meta.fetchedAt) <= 1200000 &&
    !s.warnings.telemetry &&
    s.online !== false;
  // The service doesn't document its exclusion rules; use our filtered mean if
  // any temperature-bearing device is unavailable rather than claiming its
  // server average excludes those devices.
  if (
    apiValue !== undefined &&
    Number.isFinite(apiValue) &&
    metaFresh &&
    valid.length === reported.length
  )
    return {
      value: apiValue,
      source: "api",
      used: valid.length,
      reported: reported.length,
      total: unique.length,
    };
  return {
    value: valid.length
      ? valid.reduce((sum, d) => sum + d.temperature!, 0) / valid.length
      : undefined,
    source: "calculated",
    used: valid.length,
    reported: reported.length,
    total: unique.length,
  };
}
