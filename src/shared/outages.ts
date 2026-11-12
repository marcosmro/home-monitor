import type { Snapshot } from "./model";
import { formatMinutes } from "./power";
import { madrid } from "./time";

export type OutageSignal = "plugs" | "panel" | "internet";
/**
 * A power cut inferred from reachability, never reported by the alarm. Times
 * are this app's poll times, so the true cut lies between `lastOkAt` and
 * `startedAt`, and its end between `lastDownAt` and `endedAt`.
 */
export interface InferredOutage {
  startedAt: string;
  lastOkAt?: string;
  lastDownAt: string;
  endedAt?: string;
  signals: OutageSignal[];
}
export interface OutageFile {
  panels: Record<string, { lastOkAt?: string; outages: InferredOutage[] }>;
}
const KEEP = 100;

/** What one snapshot says about mains-dependent reachability. */
export function reachability(snap: Snapshot) {
  const plugs = snap.devices.filter(
    (d) => d.type === "SmartPlug" && d.offline !== undefined,
  );
  // A failed refresh keeps old values: that is our connection, not the house.
  const plugsValid = plugs.length > 0 && !snap.warnings.smartplugs;
  const panelValid =
    !!snap.statusAt && !snap.warnings.status && snap.online !== undefined;
  const down: OutageSignal[] = [];
  if (plugsValid && plugs.every((d) => d.offline === true)) down.push("plugs");
  if (panelValid && snap.online === false) down.push("panel");
  const times = [
    ...(plugsValid ? plugs.map((d) => d.fetchedAt) : []),
    ...(panelValid ? [snap.statusAt!] : []),
  ].filter((t) => Number.isFinite(Date.parse(t)));
  const internet = snap.events
    .filter((e) => /^internet/.test(e.type.toLowerCase()))
    .sort((a, b) =>
      a.time && b.time ? Date.parse(b.time) - Date.parse(a.time) : 0,
    )[0];
  if (down.length && internet && !/restor/i.test(internet.type))
    down.push("internet");
  return {
    known: plugsValid || panelValid,
    down,
    at: times.sort().at(-1),
  };
}

/** Local, per-property log of inferred power cuts. Demo data is ignored. */
export class OutageLog {
  data: OutageFile = { panels: {} };
  onChange?: (data: OutageFile) => void;
  onEvent?: (kind: "started" | "ended", outage: InferredOutage) => void;
  list(panelId: string): InferredOutage[] {
    return structuredClone(this.data.panels[panelId]?.outages || []);
  }
  /** Records the snapshot's evidence; returns the property's cuts, newest first. */
  update(snap: Snapshot): InferredOutage[] {
    if (snap.demo || !snap.panelId) return [];
    const { known, down, at } = reachability(snap);
    if (!known || !at) return this.list(snap.panelId);
    const panel = (this.data.panels[snap.panelId] ||= { outages: [] });
    const before = JSON.stringify(panel);
    const ongoing = panel.outages[0]?.endedAt ? undefined : panel.outages[0];
    let event: "started" | "ended" | undefined;
    if (down.length) {
      if (ongoing) {
        if (at > ongoing.lastDownAt) ongoing.lastDownAt = at;
        for (const s of down)
          if (!ongoing.signals.includes(s)) ongoing.signals.push(s);
      } else {
        panel.outages.unshift({
          startedAt: at,
          lastOkAt: panel.lastOkAt,
          lastDownAt: at,
          signals: down,
        });
        panel.outages.length = Math.min(panel.outages.length, KEEP);
        event = "started";
      }
    } else {
      if (ongoing) {
        ongoing.endedAt = at > ongoing.lastDownAt ? at : ongoing.lastDownAt;
        event = "ended";
      }
      if (!panel.lastOkAt || at > panel.lastOkAt) panel.lastOkAt = at;
    }
    if (JSON.stringify(panel) !== before)
      this.onChange?.(structuredClone(this.data));
    if (event) this.onEvent?.(event, structuredClone(panel.outages[0]));
    return this.list(snap.panelId);
  }
}

/** Accepts only a well-formed saved log; anything else starts empty. */
export function validOutageFile(raw: unknown): OutageFile {
  const time = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  const out: OutageFile = { panels: {} };
  const panels = (raw as OutageFile | null)?.panels;
  if (!panels || typeof panels !== "object" || Array.isArray(panels))
    return out;
  for (const [id, p] of Object.entries(panels)) {
    if (!p || !Array.isArray(p.outages)) continue;
    out.panels[id] = {
      lastOkAt: time(p.lastOkAt) ? p.lastOkAt : undefined,
      outages: p.outages
        .filter(
          (o) =>
            o &&
            time(o.startedAt) &&
            time(o.lastDownAt) &&
            (o.endedAt === undefined || time(o.endedAt)) &&
            (o.lastOkAt === undefined || time(o.lastOkAt)) &&
            Array.isArray(o.signals) &&
            o.signals.every((s) => ["plugs", "panel", "internet"].includes(s)),
        )
        .slice(0, KEEP),
    };
  }
  return out;
}

export function inferredMinutes(o: InferredOutage) {
  if (!o.endedAt) return undefined;
  const ms = Date.parse(o.endedAt) - Date.parse(o.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : undefined;
}

/** Desktop notification text. Main-process only, so not routed through t(). */
export function inferredNotification(
  kind: "started" | "ended",
  o: InferredOutage,
  home: string,
  language: "en" | "es" = "en",
) {
  const es = language === "es";
  const what = o.signals.includes("plugs")
    ? es
      ? "Todos los enchufes inteligentes dejaron de responder"
      : "All smart plugs became unreachable"
    : es
      ? "La central de alarma se desconectó"
      : "The alarm panel went offline";
  if (kind === "started")
    return {
      title: es
        ? `Posible corte de luz en ${home}`
        : `Possible power cut at ${home}`,
      body: es
        ? `${what}. Detectado: ${madrid(o.startedAt, true)} (Madrid). La alarma no ha informado de un fallo eléctrico.`
        : `${what}. Detected: ${madrid(o.startedAt, true)} (Madrid). The alarm has not reported a mains failure.`,
    };
  const minutes = inferredMinutes(o);
  const length =
    minutes === undefined
      ? ""
      : es
        ? ` Sin respuesta durante unos ${formatMinutes(minutes)}.`
        : ` Unreachable for about ${formatMinutes(minutes)}.`;
  return {
    title: es
      ? `Fin del posible corte de luz en ${home}`
      : `Possible power cut over at ${home}`,
    body: es
      ? `Todo vuelve a responder: ${madrid(o.endedAt, true)} (Madrid).${length}`
      : `Everything is reachable again: ${madrid(o.endedAt, true)} (Madrid).${length}`,
  };
}
