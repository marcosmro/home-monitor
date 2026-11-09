export const HOUSE_ZONE = "Europe/Madrid";
export function instant(value: unknown): string | undefined {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value))
    return undefined;
  const n = Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : undefined;
}
export function madrid(value?: string, date = false): string {
  if (!value) return "Not reported";
  const d = new Date(value);
  if (!Number.isFinite(+d)) return "Not reported";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOUSE_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${date ? `${get("year")}-${get("month")}-${get("day")} · ` : ""}${get("hour")}:${get("minute")}:${get("second")}`;
}
// Legacy wall times are already house-local. Preserve rather than guessing a DST-fold instant.
export function eventTime(e: { time?: string; localTime?: string }) {
  return e.time
    ? madrid(e.time, true)
    : e.localTime
      ? `${e.localTime.replace("T", " · ")} (local; offset unavailable)`
      : "Time not reported";
}
