import { activityAction, activityCategory } from "./activity-identity";
import type { Event, Snapshot } from "./model";
import { activityDay } from "./activity-calendar";
import { madrid } from "./time";

const hour = 3600000;
type Action = Exclude<ReturnType<typeof activityAction>, "other">;
export interface DayMark {
  at: number;
  event: Event;
  action: Action | "other";
}
interface Change {
  at: number;
  sequence: number;
  inferredBoundary?: boolean;
  action?: Action;
  mark?: DayMark;
}
interface Track {
  id: string;
  label: string;
  kind: "alarm" | "plug" | "events";
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
function nextDay(day: string) {
  return new Date(Date.parse(day + "T00:00:00Z") + 24 * hour)
    .toISOString()
    .slice(0, 10);
}
export function dayTimeline(snap: Snapshot, day: string, now: number) {
  const next = nextDay(day);
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
    snap.areas.length > 1 ? mainArea.name : "Alarm system",
    "alarm",
  );
  const unidentified = "plug:unknown";
  const annexIds = new Set<number>();
  for (const event of snap.events) {
    if (
      event.areaId !== undefined &&
      event.type.toLowerCase().endsWith("annex")
    )
      annexIds.add(event.areaId);
  }
  for (const area of snap.areas) {
    if (/^(annex|anexo)$/i.test(area.name.trim())) annexIds.add(area.id);
  }
  const annexId = annexIds.size === 1 ? [...annexIds][0] : undefined;
  function eventTrack(e: Event, action: DayMark["action"]) {
    const type = e.type.toLowerCase();
    if (action === "other") {
      const category = activityCategory(e);
      if (category === "incidents")
        return track("incidents", "Alarm events", "events");
      if (category === "health")
        return track("health", "Device & connection health", "events");
      return track("other", "Other events", "events");
    }
    if (action === "plug-on" || action === "plug-off") {
      return track(
        e.deviceId ? "plug:" + e.deviceId : unidentified,
        e.deviceId ? "Smart plug" : "Unidentified plug",
        "plug",
      );
    }
    const isAnnex = type.endsWith("annex");
    const areaId = e.areaId ?? (isAnnex ? annexId : undefined);
    if (areaId !== undefined) {
      const area = snap.areas.find((a) => a.id === areaId);
      return track(
        "area:" + areaId,
        area?.name || e.areaName || String(areaId),
        "alarm",
      );
    }
    if (isAnnex) return track("annex", "Annex", "alarm");
    return snap.areas.length > 1
      ? track("area:unknown", "Unidentified area", "alarm")
      : main;
  }

  let latest = start;
  const unplaced: Event[] = [];
  let uncertainTimes = 0;
  const unknownPlugChanges: Change[] = [];
  // An undated record is still ordered between its neighbours. Use those
  // bounds to show where the state is uncertain, without fabricating a mark.
  let newer = Number.isFinite(fetched) ? Math.min(fetched, now) : now;
  const records = snap.events.map((event) => {
    const times = (
      event.time
        ? [Date.parse(event.time)]
        : wallInstants(event.localTime ?? "")
    ).filter(Number.isFinite);
    const upper = newer;
    if (times.length === 1) newer = times[0];
    return { event, times, upper };
  });
  let older = -Infinity;
  // Retain source order for ties, including when an anonymous plug switch
  // invalidates the state of another track at the same instant.
  for (let i = records.length - 1; i >= 0; i--) {
    const { event: e, times, upper } = records[i];
    const action = activityAction(e);
    const row = eventTrack(e, action);
    function change(
      at: number,
      state?: Action,
      mark?: DayMark,
      inferredBoundary = false,
    ) {
      if (at >= end || at > now) return;
      row.changes.push({
        at,
        sequence: -i,
        action: state,
        mark,
        inferredBoundary,
      });
      if (row.id === unidentified)
        unknownPlugChanges.push({ at, sequence: -i, inferredBoundary });
    }
    const state = action === "other" ? undefined : action;
    if (times.length === 1) {
      older = times[0];
      if (older < end && older <= now) latest = Math.max(older, latest);
      change(older, state, { at: older, action, event: e });
      continue;
    }
    const localDay = activityDay(e);
    const lower = Math.max(
      older,
      times[0] ??
        (localDay ? wallInstants(localDay + "T00:00:00")[0] : -Infinity),
    );
    const upperBound = Math.min(
      upper,
      times.at(-1) ??
        (localDay
          ? wallInstants(nextDay(localDay) + "T00:00:00")[0]
          : Infinity),
    );
    if (
      (localDay ? localDay === day : lower < end && upperBound >= start) &&
      lower <= now
    ) {
      unplaced.push(e);
      if (times.length > 1) uncertainTimes++;
    }
    if (!state || lower > upperBound) continue;
    change(lower, undefined, undefined, true);
    // By the newer record (or the fetch) this action has completed. A
    // subsequent change at that same boundary wins in provider order.
    change(upperBound, state, undefined, true);
  }
  const until = Math.min(
    now,
    end,
    Math.max(start, latest, Number.isFinite(fetched) ? fetched : start),
  );
  const rows = [...tracks.values()]
    .map((row) => {
      const anonymous =
        row.kind === "events" ||
        row.id === unidentified ||
        row.id === "area:unknown";
      const changes = [...row.changes];
      if (row.kind === "plug" && !anonymous)
        changes.push(...unknownPlugChanges);
      if (row.kind === "alarm" && !anonymous) {
        for (const c of tracks.get("area:unknown")?.changes ?? [])
          changes.push({
            at: c.at,
            sequence: c.sequence,
            inferredBoundary: c.inferredBoundary,
          });
      }
      changes.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
      const segments: { from: number; to: number; action?: Action }[] = [];
      let from = start;
      let state: Action | undefined;
      const marks: DayMark[] = [];
      let lastSequence = -Infinity;
      for (const c of changes) {
        if (c.at > until) break;
        // Overlapping uncertain times must not restore an earlier state
        // after a later record may already have changed it.
        if (c.inferredBoundary && c.sequence < lastSequence) continue;
        lastSequence = Math.max(lastSequence, c.sequence);
        if (c.at >= start && c.mark) marks.push(c.mark);
        if (state === c.action) continue;
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
  return { start, end, until, ticks, rows, uncertainTimes, unplaced };
}
