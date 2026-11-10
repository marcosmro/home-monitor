import type { Event } from "./model";
import { madrid } from "./time";

/** Activity is historical, and its day boundary belongs to the house in Madrid. */
export function canSelectActivityDay(day: string, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(now)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return (
    Number.isFinite(+date) &&
    date.toISOString().slice(0, 10) === day &&
    day <= madrid(new Date(now).toISOString(), true).slice(0, 10)
  );
}
export function activityDay(
  event: Pick<Event, "time" | "localTime">,
): string | undefined {
  if (event.time && Number.isFinite(Date.parse(event.time)))
    return madrid(event.time, true).slice(0, 10);
  const local = event.localTime?.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s|$)/)?.[1];
  return local &&
    Number.isFinite(Date.parse(local)) &&
    new Date(local).toISOString().slice(0, 10) === local
    ? local
    : undefined;
}
export function calendarDays(month: string): (string | undefined)[] {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1));
  const offset = (start.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) =>
    i < offset || i >= offset + length
      ? undefined
      : `${month}-${String(i - offset + 1).padStart(2, "0")}`,
  );
}
