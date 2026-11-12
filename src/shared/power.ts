import type { Event, Snapshot } from "./model";
import { eventTime } from "./time";

type Moment = Pick<Event, "time" | "localTime">;
export interface PowerStatus {
  /** `out`: the latest mains event is a failure. `restored`: it came back. */
  state: "out" | "restored";
  /** Stable identity of the latest mains event, for dismissal and alerts. */
  key: string;
  lost?: Moment;
  restored?: Moment;
}

/** The server mixes `mains`, `mains_restored` and `mainsrestore`. */
export function powerKind(type: string): "lost" | "restored" | undefined {
  const t = type.toLowerCase().replace(/[-_\s]/g, "");
  if (!t.startsWith("mains")) return undefined;
  return t.includes("restor") ? "restored" : "lost";
}

/**
 * Mains state derived from the activity history, the only place the alarm
 * reports it. Undefined when the loaded history holds no mains event.
 */
export function powerStatus(events: Event[]): PowerStatus | undefined {
  const mains = events
    .map((e, index) => ({ e, index, kind: powerKind(e.type) }))
    .filter((x) => x.kind)
    // Newest first: by instant when both have one, else by history order.
    .sort((a, b) =>
      a.e.time && b.e.time && a.e.time !== b.e.time
        ? Date.parse(b.e.time) - Date.parse(a.e.time)
        : a.index - b.index,
    );
  const latest = mains[0];
  if (!latest) return undefined;
  const moment = ({ time, localTime }: Event): Moment => ({ time, localTime });
  const key = `${latest.kind}@${latest.e.time || latest.e.localTime || ""}`;
  if (latest.kind === "lost")
    return { state: "out", key, lost: moment(latest.e) };
  const before = mains[1];
  return {
    state: "restored",
    key,
    restored: moment(latest.e),
    lost: before?.kind === "lost" ? moment(before.e) : undefined,
  };
}

/** Whole minutes without power, when both ends have an absolute instant. */
export function outageMinutes(s: PowerStatus): number | undefined {
  if (!s.lost?.time || !s.restored?.time) return undefined;
  const ms = Date.parse(s.restored.time) - Date.parse(s.lost.time);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : undefined;
}
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Desktop notification text. Main-process only, so not routed through t(). */
export function powerNotification(
  s: PowerStatus,
  home: string,
  language: "en" | "es" = "en",
) {
  const es = language === "es";
  if (s.state === "out")
    return {
      title: es ? `Corte de luz en ${home}` : `Power outage at ${home}`,
      body: es
        ? `La alarma informó de un fallo de suministro eléctrico: ${eventTime(s.lost!)} (Madrid).`
        : `The alarm reported a mains power failure: ${eventTime(s.lost!)} (Madrid).`,
    };
  const minutes = outageMinutes(s);
  const length =
    minutes === undefined
      ? ""
      : es
        ? ` Sin luz durante ${formatMinutes(minutes)}.`
        : ` It was out for ${formatMinutes(minutes)}.`;
  return {
    title: es ? `Ha vuelto la luz en ${home}` : `Power restored at ${home}`,
    body: es
      ? `El suministro eléctrico volvió: ${eventTime(s.restored!)} (Madrid).${length}`
      : `Mains power came back: ${eventTime(s.restored!)} (Madrid).${length}`,
  };
}

/**
 * Decides when a snapshot warrants a notification. The first loaded history
 * of a property is a baseline: it alerts only if the power is out right now.
 * After that, every new mains event alerts once. Demo data never alerts.
 */
export class PowerWatcher {
  private panel?: string;
  private key?: string;
  check(snap: Snapshot): PowerStatus | undefined {
    if (snap.demo) {
      this.panel = undefined;
      return undefined;
    }
    if (!snap.eventsAt) return undefined;
    const status = powerStatus(snap.events);
    const first = this.panel !== snap.panelId;
    const changed = status?.key !== this.key;
    this.panel = snap.panelId;
    this.key = status?.key;
    if (first) return status?.state === "out" ? status : undefined;
    return changed ? status : undefined;
  }
}
