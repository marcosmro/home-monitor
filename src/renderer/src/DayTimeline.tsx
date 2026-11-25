import { useMemo, useRef, useState, useEffect } from "react";
import { actorTag } from "../../shared/activity-identity";
import { dayTimeline, type DayMark } from "../../shared/day-timeline";
import {
  displayDevice,
  type Snapshot,
  type Preferences,
} from "../../shared/model";
import { madrid } from "../../shared/time";
import { ActivityActor } from "./ActivityIdentity";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";

const labels = {
  armed: "Fully armed",
  partial: "Partially armed",
  disarmed: "Disarmed",
  "plug-on": "On",
  "plug-off": "Off",
};
const symbols = {
  armed: "lock",
  partial: "shield-half",
  disarmed: "unlock",
  "plug-on": "plug",
  "plug-off": "plug-off",
};
const clock = (at: number) => madrid(new Date(at).toISOString()).slice(0, 5);

function groupedMarks(
  marks: DayMark[],
  start: number,
  end: number,
  width: number,
) {
  const groups: DayMark[][] = [];
  for (const mark of marks) {
    const last = groups.at(-1);
    if (last && ((mark.at - last[0].at) / (end - start)) * width < 27)
      last.push(mark);
    else groups.push([mark]);
  }
  return groups;
}

export function DayTimeline({
  snap,
  prefs,
  day,
  deviceId,
}: {
  snap: Snapshot;
  prefs: Preferences;
  day: string;
  deviceId?: string;
}) {
  const { t } = useLanguage();
  const data = useMemo(() => dayTimeline(snap, day, Date.now()), [snap, day]);
  const rows = data.rows.filter(
    (row) => !deviceId || row.id === "plug:" + deviceId,
  );
  const [selection, setSelection] = useState<string[]>([]);
  const scale = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useEffect(() => {
    if (!scale.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(scale.current);
    return () => observer.disconnect();
  }, [rows.length]);
  if (!rows.length) return null;
  const pos = (at: number) =>
    (100 * (at - data.start)) / (data.end - data.start);
  const rowLabel = (row: (typeof rows)[number]) => {
    const device =
      row.kind === "plug" &&
      snap.devices.find((d) => "plug:" + d.id === row.id);
    return device ? displayDevice(device, prefs) : t(row.label);
  };
  const keypadName = (mark: DayMark) => {
    const keypad = snap.devices.find(
      (d) => d.id === mark.event.deviceId && d.type === "Keypad",
    );
    return keypad ? displayDevice(keypad, prefs) : undefined;
  };
  const changes = rows
    .flatMap((row) => row.marks.map((mark) => ({ mark, row })))
    .sort((a, b) => b.mark.at - a.mark.at);
  const selected = changes.filter(({ mark }) =>
    selection.includes(mark.event.id),
  );
  const shown = selected.length ? selected : changes.slice(0, 1);
  const used = new Set(
    rows.flatMap((row) => row.segments.map((s) => s.action)),
  );
  return (
    <section className="day-timeline" aria-label={t("Daily timeline")}>
      <div className="day-chart-title">
        <h3>{t("Daily timeline")}</h3>
        <small>Europe/Madrid</small>
      </div>
      <div className="day-chart-scale" ref={scale}>
        {data.ticks.map((tick) => (
          <span key={tick.at} style={{ left: pos(tick.at) + "%" }}>
            {tick.label}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div className="day-chart-row" key={row.id}>
          <div className="day-chart-label">
            <Icon name={row.kind === "alarm" ? "shield" : "plug"} size={14} />
            <strong>{rowLabel(row)}</strong>
          </div>
          <div className="day-chart-track">
            {row.segments.map((s) => {
              const label = t(s.action ? labels[s.action] : "Unknown state");
              const span = pos(s.to) - pos(s.from);
              const title =
                label +
                " · " +
                clock(s.from) +
                " – " +
                (s.to === data.end ? "24:00" : clock(s.to));
              return (
                <span
                  key={s.from}
                  className={"day-segment seg-" + (s.action ?? "unknown")}
                  style={{ left: pos(s.from) + "%", width: span + "%" }}
                  title={title}
                  aria-label={title}
                >
                  {s.action && (span * width) / 100 > 135 && (
                    <span>{label}</span>
                  )}
                </span>
              );
            })}
            {data.ticks.slice(1, -1).map((tick) => (
              <i
                className="day-gridline"
                key={tick.at}
                style={{ left: pos(tick.at) + "%" }}
              />
            ))}
            {groupedMarks(row.marks, data.start, data.end, width).map(
              (group, i, groups) => {
                const first = group[0];
                const spaceAfter =
                  ((pos(groups[i + 1]?.[0].at ?? data.end) - pos(first.at)) *
                    width) /
                  100;
                const labelSwitch =
                  row.anonymous &&
                  row.kind === "plug" &&
                  group.length === 1 &&
                  spaceAfter > 90;
                const channel = first.event.channel?.toLowerCase();
                const icon =
                  channel === "keypad"
                    ? "keypad"
                    : channel === "keytag"
                      ? "key"
                      : symbols[first.action];
                const tag =
                  channel === "keytag" &&
                  actorTag(first.event.user, snap.keyTagPeople)?.color;
                const title = group
                  .map((m) =>
                    [
                      clock(m.at),
                      t(m.event.description),
                      m.event.user,
                      m.event.channel && t(m.event.channel),
                      keypadName(m),
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  )
                  .join("\n");
                return (
                  <button
                    type="button"
                    className={"day-marker marker-" + row.kind}
                    key={first.event.id}
                    style={{
                      left: `clamp(10px, ${pos(first.at)}%, calc(100% - 10px))`,
                    }}
                    title={title}
                    aria-label={title}
                    aria-pressed={shown.some(({ mark }) =>
                      group.some((m) => m.event.id === mark.event.id),
                    )}
                    onClick={() => setSelection(group.map((m) => m.event.id))}
                  >
                    {group.length > 1 ? (
                      group.length
                    ) : (
                      <Icon name={icon} size={12} />
                    )}
                    {labelSwitch && (
                      <span className="day-switch-label">
                        {t(labels[first.action])}
                      </span>
                    )}
                    {group.length === 1 && tag && (
                      <i aria-hidden="true" className={`day-tag tag-${tag}`} />
                    )}
                  </button>
                );
              },
            )}
          </div>
        </div>
      ))}
      <div className="day-chart-legend">
        {[...used].map((state) => (
          <span key={state ?? "unknown"}>
            <i className={"day-swatch seg-" + (state ?? "unknown")} />
            {t(state ? labels[state] : "Unknown state")}
          </span>
        ))}
      </div>
      {rows.some((r) => r.id === "plug:unknown") && (
        <p>
          {t("The log records these switches without identifying the plug.")}
        </p>
      )}
      {data.uncertainTimes > 0 && (
        <p>
          {t("Changes with an ambiguous local time are listed in the history.")}
        </p>
      )}
      {data.until > data.start && data.until < data.end && (
        <p>{t("History through {0}", clock(data.until))}</p>
      )}
      {shown.map(({ mark, row }) => (
        <div className="day-change" key={mark.event.id}>
          <time>{clock(mark.at)}</time>
          <Icon name={symbols[mark.action]} size={14} />
          <strong>{t(mark.event.description)}</strong>
          <span>{keypadName(mark) ?? rowLabel(row)}</span>
          <ActivityActor
            event={mark.event}
            people={
              mark.event.channel?.toLowerCase() === "keytag"
                ? snap.keyTagPeople
                : undefined
            }
          />
        </div>
      ))}
    </section>
  );
}
