import type { Device } from "./model";

/** Keep slot IDs separate from sensor IDs; neither labels nor slots imply a room. */
export function smartPlugs(raw: unknown, fetchedAt: string): Device[] {
  if (
    !Array.isArray(raw) ||
    raw.some((p) => !p || typeof p !== "object" || p.Id == null)
  )
    throw new Error(
      "Smart plug response was not recognized. Last-known values retained.",
    );
  return raw.map((p) => {
    const status =
      typeof p.Status === "string" ? p.Status.toLowerCase() : "unknown";
    return {
      id: `smartplug:${p.Id}`,
      original:
        typeof p.Label === "string" && p.Label ? p.Label : `Smart plug ${p.Id}`,
      type: "SmartPlug",
      floorId: "unassigned",
      floor: "Unassigned",
      floorEs: "Sin asignar",
      roomId: "unassigned",
      room: "Unassigned",
      roomEs: "Sin asignar",
      plugState: status === "on" || status === "off" ? status : "unknown",
      offline: ["unreachable", "disconnected"].includes(status)
        ? true
        : ["on", "off"].includes(status)
          ? false
          : undefined,
      timerActive:
        typeof p.TimerActive === "boolean" ? p.TimerActive : undefined,
      manufacturer:
        typeof p.Manufacturer === "string" ? p.Manufacturer : undefined,
      changedAt: typeof p.LastChanged === "string" ? p.LastChanged : undefined,
      fetchedAt,
      source: "smartplugs",
    };
  });
}
