import type { dayTimeline } from "../../shared/day-timeline";
import { useLanguage } from "./i18n";

type Segments = ReturnType<typeof dayTimeline>["rows"][number]["segments"];
const states = [
  ["armed", "Full arming"],
  ["partial", "Partial arming"],
  ["disarmed", "Disarmed"],
  ["unknown", "Unknown state"],
] as const;

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds ? seconds + " s" : "<1 s";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return [hours && hours + " h", minutes % 60 && (minutes % 60) + " min"]
    .filter(Boolean)
    .join(" ");
}

export function AlarmDurationSummary({ segments }: { segments: Segments }) {
  const { t } = useLanguage();
  if (!segments.some((s) => s.action)) return null;
  const totals = new Map<string, number>();
  for (const segment of segments) {
    const state = segment.action ?? "unknown";
    totals.set(state, (totals.get(state) ?? 0) + segment.to - segment.from);
  }
  return (
    <dl className="alarm-durations" aria-label={t("Time by alarm state")}>
      {states
        .filter(([state]) => totals.has(state))
        .map(([state, label]) => (
          <div key={state}>
            <dt>
              <i className={"day-swatch seg-" + state} aria-hidden="true" />
              {t(label)}
            </dt>
            <dd>{duration(totals.get(state)!)}</dd>
          </div>
        ))}
    </dl>
  );
}
