import { activityAction } from "./activity-identity";
import type { Event, Snapshot } from "./model";
import { madrid } from "./time";

const hour = 3600000;
type Action = Exclude<ReturnType<typeof activityAction>, "other">;
export interface DayMark {
  at: number;
  event: Event;
  action: Action;
}
interface Change {
  at: number;
  action?: Action;
  mark?: DayMark;
}
interface Track {
  id: string;
  label: string;
  kind: "alarm" | "plug";
  changes: Change[];
}

// Resolve the house's wall clock against both Madrid offsets. A repeated
// autumn hour without an offset cannot locate a transition unambiguously.
function wallInstants(wall: string) {
  const local = wall.slice(0, 19).replace(" ", "T");
  const normalized = local.length === 16 ? local + ":00" : local;
  const utc = Date.parse(normalized + "Z");
  if (!Number.isFinite(utc)) return [];
  return [utc - 2 * hour, utc - hour].filter(
    (at) =>
      madrid(new Date(at).toISOString(), true).replace(" · ", "T") ===
      normalized,
  );
}
export function dayTimeline(snap: Snapshot, day: string, now: number) {
  const next = new Date(Date.parse(day + "T00:00:00Z") + 24 * hour)
    .toISOString()
    .slice(0, 10);
  const start = wallInstants(day + "T00:00:00")[0];
  const end = wallInstants(next + "T00:00:00")[0];
  const fetched = Date.parse(snap.eventsAt ?? "");
  const tracks = new Map<string, Track>();
  function track(id: string, label: string, kind: Track["kind"]) {
    if (!tracks.has(id)) tracks.set(id, { id, label, kind, changes: [] });
    return tracks.get(id)!;
  }
  const mainArea = snap.areas[0];
  const main = track(
    "area:" + (mainArea?.id ?? "main"),
    "Alarm system",
    "alarm",
  );
  const unidentified = "plug:unknown";
  let latest = start;
  let uncertainTimes = 0;
  const unknownPlugChanges: Change[] = [];
  // Reverse newest-first history so a tie preserves the provider's sequence.
  for (const e of [...snap.events].reverse()) {
    const action = activityAction(e);
    if (action === "other") continue;
    const times = e.time
      ? [Date.parse(e.time)]
      : wallInstants(e.localTime ?? "");
    if (
      !times.length ||
      !Number.isFinite(times[0]) ||
      times[0] >= end ||
      times[0] > now
    )
      continue;
    const plug = action === "plug-on" || action === "plug-off";
    const annex = e.type.toLowerCase().endsWith("annex");
    const area =
      e.areaId === undefined
        ? undefined
        : snap.areas.find((a) => a.id === e.areaId);
    const row = plug
      ? track(
          e.deviceId ? "plug:" + e.deviceId : unidentified,
          "Unidentified plug",
          "plug",
        )
      : area && area.id === mainArea?.id
        ? main
        : e.areaId !== undefined
          ? track(
              "area:" + e.areaId,
              area?.name || e.areaName || String(e.areaId),
              "alarm",
            )
          : annex
            ? track("annex", "Annex", "alarm")
            : snap.areas.length > 1
              ? track("area:unknown", "Unidentified area", "alarm")
              : main;
    if (times.length > 1 && times[0] >= start) uncertainTimes++;
    for (const at of times) {
      if (at >= end || at > now) continue;
      latest = Math.max(latest, at);
      const change: Change = {
        at,
        action: times.length === 1 ? action : undefined,
        mark: times.length === 1 ? { at, action, event: e } : undefined,
      };
      row.changes.push(change);
      if (row.id === unidentified) unknownPlugChanges.push({ at });
    }
  }
  const until = Math.min(
    now,
    end,
    Math.max(start, latest, Number.isFinite(fetched) ? fetched : start),
  );
  const rows = [...tracks.values()]
    .map((row) => {
      const anonymous = row.id === unidentified || row.id === "area:unknown";
      const changes = [...row.changes];
      if (row.kind === "plug" && !anonymous)
        changes.push(...unknownPlugChanges);
      if (row.kind === "alarm" && !anonymous) {
        for (const c of tracks.get("area:unknown")?.changes ?? [])
          changes.push({ at: c.at });
      }
      changes.sort((a, b) => a.at - b.at);
      const segments: { from: number; to: number; action?: Action }[] = [];
      let from = start;
      let state: Action | undefined;
      const marks: DayMark[] = [];
      for (const c of changes) {
        if (c.at >= start && c.mark) marks.push(c.mark);
        if (!anonymous && c.at > from)
          segments.push({ from, to: c.at, action: state });
        from = Math.max(start, c.at);
        state = c.action;
      }
      if (!anonymous && until > from)
        segments.push({ from, to: until, action: state });
      return {
        id: row.id,
        kind: row.kind,
        label: row.label,
        segments,
        marks,
        anonymous,
      };
    })
    .filter(
      (row) =>
        row.id === main.id ||
        row.marks.length ||
        row.segments.some((s) => s.action),
    );
  const ticks = [0, 6, 12, 18, 24].map((h) => ({
    at:
      h === 24
        ? end
        : wallInstants(day + "T" + String(h).padStart(2, "0") + ":00:00")[0],
    label: String(h).padStart(2, "0") + ":00",
  }));
  return { start, end, until, ticks, rows, uncertainTimes };
}
