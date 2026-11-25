import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useId,
  type KeyboardEvent,
} from "react";
import {
  actorTag,
  matchesActivityFilter,
} from "../../shared/activity-identity";
import { dayTimeline, type DayMark } from "../../shared/day-timeline";
import {
  displayDevice,
  type Snapshot,
  type Preferences,
  type Event,
} from "../../shared/model";
import { HOUSE_ZONE, madrid } from "../../shared/time";
import { AlarmDurationSummary } from "./AlarmDurationSummary";
import { ActivityActor } from "./ActivityIdentity";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";

const labels = {
  armed: "Fully armed",
  partial: "Partially armed",
  disarmed: "Disarmed",
  "plug-on": "On",
  "plug-off": "Off",
  other: "Other events",
};
const symbols = {
  armed: "lock",
  partial: "shield-half",
  disarmed: "unlock",
  "plug-on": "plug",
  "plug-off": "plug-off",
  other: "clock",
};
const houseOffset = new Intl.DateTimeFormat("en-GB", {
  timeZone: HOUSE_ZONE,
  timeZoneName: "shortOffset",
});

const markerRadius = 15;
const markerSpacing = markerRadius * 2 + 4;
function markerCenter(at: number, start: number, end: number, width: number) {
  return Math.max(
    markerRadius,
    Math.min(width - markerRadius, ((at - start) / (end - start)) * width),
  );
}

function navigateMarkers(event: KeyboardEvent<HTMLButtonElement>) {
  const buttons = Array.from(
    event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
      ".day-marker",
    ),
  );
  const i = buttons.indexOf(event.currentTarget);
  let next: number;
  switch (event.key) {
    case "ArrowLeft":
      next = Math.max(0, i - 1);
      break;
    case "ArrowRight":
      next = Math.min(buttons.length - 1, i + 1);
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = buttons.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  buttons[next].focus();
}

function groupedMarks(
  marks: DayMark[],
  start: number,
  end: number,
  width: number,
) {
  const groups: DayMark[][] = [];
  for (const mark of marks) {
    const last = groups.at(-1);
    if (
      last &&
      markerCenter(mark.at, start, end, width) -
        markerCenter(last[0].at, start, end, width) <
        markerSpacing
    )
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
  filter = "all",
  onSelectSensor,
}: {
  snap: Snapshot;
  prefs: Preferences;
  day: string;
  deviceId?: string;
  filter?: string;
  onSelectSensor?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const data = useMemo(() => dayTimeline(snap, day, Date.now()), [snap, day]);
  const chartId = useId();
  const matches = (event: Event) =>
    (!deviceId || event.deviceId === deviceId) &&
    matchesActivityFilter(event, filter);
  const rows = data.rows
    .map((row) => {
      const marks = row.marks.filter((mark) => matches(mark.event));
      const showSegments =
        (!deviceId || row.id === "plug:" + deviceId) &&
        (filter === "all" ||
          (filter === "alarm" && row.kind === "alarm") ||
          (filter === "plug" && row.kind === "plug"));
      return { ...row, marks, segments: showSegments ? row.segments : [] };
    })
    .filter((row) => row.marks.length || row.segments.length);
  const unplaced = data.unplaced.filter(matches);
  const [selection, select] = useState<{
    id: string;
    group?: boolean;
  } | null>();
  useEffect(() => select(undefined), [snap.panelId, day, deviceId, filter]);
  const selectedId = selection?.id;
  const keyColor = (event: Event) =>
    event.channel?.toLowerCase().replace(/[-_ ]/g, "") === "keytag"
      ? actorTag(event.user, snap.keyTagPeople)?.color
      : undefined;
  const firstTrack = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useEffect(() => {
    if (!firstTrack.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(firstTrack.current);
    return () => observer.disconnect();
  }, [rows[0]?.id]);

  function clock(at: number, seconds = false) {
    const time = madrid(new Date(at).toISOString()).slice(0, seconds ? 8 : 5);
    if (data.end - data.start > 24 * 3600000 && time.startsWith("02:")) {
      const offset = houseOffset
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value;
      if (offset) return time + " " + offset;
    }
    return time;
  }
  function groupTimeRange(group: DayMark[]) {
    const from = group[0].at;
    const to = group[group.length - 1].at;
    if (from === to) return clock(from, true);
    const seconds = clock(from) === clock(to);
    return clock(from, seconds) + " – " + clock(to, seconds);
  }
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
  const active =
    changes.find((c) => c.mark.event.id === selectedId) ??
    (selection === undefined ? changes[0] : undefined);
  const deviceName = (event: Event) =>
    snap.devices.find((d) => d.id === event.deviceId);
  const keys = new Map<string, NonNullable<ReturnType<typeof keyColor>>>();
  for (const { mark } of changes) {
    const color = keyColor(mark.event);
    if (color && mark.event.user) keys.set(mark.event.user, color);
  }
  function detail(event: Event, time: string, grouped = false) {
    const device = deviceName(event);
    return (
      <div className="day-change" aria-live={grouped ? undefined : "polite"}>
        <time dateTime={event.time || event.localTime}>{time}</time>
        <strong>{t(event.description)}</strong>
        <ActivityActor
          event={event}
          people={keyColor(event) ? snap.keyTagPeople : undefined}
        />
        {device &&
          (onSelectSensor ? (
            <button onClick={() => onSelectSensor(device.id)}>
              {displayDevice(device, prefs)}
            </button>
          ) : (
            <span>{displayDevice(device, prefs)}</span>
          ))}
      </div>
    );
  }
  const alarmRows = rows.filter(
    (row) => row.kind === "alarm" && row.segments.length,
  );
  const summary =
    alarmRows.length === 1 && alarmRows[0].segments.some((s) => s.action)
      ? alarmRows[0]
      : undefined;
  const used = new Set(
    rows
      .filter((row) => row !== summary)
      .flatMap((row) => row.segments.map((s) => s.action)),
  );
  return (
    <section className="day-timeline" aria-label={t("Daily timeline")}>
      <div className="day-chart-title">
        <h3>{t("Daily timeline")}</h3>
        <small>Europe/Madrid</small>
      </div>
      {summary && <AlarmDurationSummary segments={summary.segments} />}
      <div className="day-chart-scale">
        {data.ticks.map((tick) => (
          <span key={tick.at} style={{ left: pos(tick.at) + "%" }}>
            {tick.label}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const groups = groupedMarks(row.marks, data.start, data.end, width);
        const expanded = selection?.group
          ? groups.find(
              (group) =>
                group.length > 1 &&
                group.some((m) => m.event.id === selectedId),
            )
          : undefined;
        const rowId = chartId + "-" + encodeURIComponent(row.id);
        const groupPanelId = rowId + "-group";
        const rowIcon =
          row.kind === "plug"
            ? "plug"
            : row.kind === "alarm"
              ? "shield"
              : row.id === "incidents"
                ? "alert"
                : row.id === "health"
                  ? "battery"
                  : "clock";
        const markerId = (mark: DayMark) =>
          rowId + "-" + encodeURIComponent(mark.event.id);
        const closeGroup = () => {
          if (expanded) document.getElementById(markerId(expanded[0]))?.focus();
          select(null);
        };
        return (
          <div
            className="day-chart-row"
            role="group"
            aria-labelledby={rowId}
            key={row.id}
            onKeyDown={(event) => {
              if (event.key === "Escape" && expanded) {
                event.stopPropagation();
                event.preventDefault();
                closeGroup();
              }
            }}
          >
            <div className="day-chart-label">
              <Icon name={rowIcon} size={14} />
              <strong id={rowId}>{rowLabel(row)}</strong>
            </div>
            <div
              className="day-chart-track"
              ref={row === rows[0] ? firstTrack : undefined}
            >
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
                    role="img"
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
              {groups.map((group, i, groups) => {
                const first = group[0];
                const center = markerCenter(
                  first.at,
                  data.start,
                  data.end,
                  width,
                );
                const next = groups[i + 1];
                const right = next
                  ? markerCenter(next[0].at, data.start, data.end, width) -
                    markerRadius
                  : width;
                const labelWidth = right - center - markerRadius - 9;
                const inlineLabel =
                  group.length === 1 && labelWidth >= 58 && row.anonymous
                    ? t(
                        row.kind === "plug"
                          ? labels[first.action]
                          : first.event.description,
                      )
                    : undefined;
                const channel = first.event.channel
                  ?.toLowerCase()
                  .replace(/[-_ ]/g, "");
                const icon =
                  channel === "keypad"
                    ? "keypad"
                    : channel === "keytag"
                      ? "key"
                      : first.action === "other"
                        ? rowIcon
                        : symbols[first.action];
                const colors = [
                  ...new Set(
                    group.map((m) => keyColor(m.event)).filter(Boolean),
                  ),
                ];
                const tag = group.length === 1 ? colors[0] : undefined;
                const title =
                  group.length > 1
                    ? t("{0} events", group.length) +
                      " · " +
                      groupTimeRange(group)
                    : [
                        clock(first.at),
                        t(first.event.description),
                        first.event.user,
                        first.event.channel && t(first.event.channel),
                        keypadName(first),
                        tag &&
                          t(
                            "Assigned key tag: {0}",
                            t(tag[0].toUpperCase() + tag.slice(1)),
                          ),
                      ]
                        .filter(Boolean)
                        .join(" · ");
                return (
                  <button
                    type="button"
                    className={`day-marker marker-${row.kind} ${tag ? "colored-key tag-" + tag : ""}`}
                    key={first.event.id}
                    id={markerId(first)}
                    onKeyDown={navigateMarkers}
                    aria-keyshortcuts="ArrowLeft ArrowRight Home End"
                    style={{
                      left: `clamp(${markerRadius}px, ${pos(first.at)}%, calc(100% - ${markerRadius}px))`,
                    }}
                    title={title}
                    aria-label={title}
                    aria-pressed={
                      group.length === 1
                        ? first.event.id === active?.mark.event.id
                        : undefined
                    }
                    aria-controls={
                      expanded === group ? groupPanelId : undefined
                    }
                    aria-expanded={
                      group.length > 1 ? expanded === group : undefined
                    }
                    onClick={(event) => {
                      if (expanded === group) {
                        closeGroup();
                        return;
                      }
                      const openGroup = group.length > 1;
                      select({ id: first.event.id, group: openGroup });
                      if (openGroup && event.detail === 0) {
                        requestAnimationFrame(() =>
                          document
                            .getElementById(groupPanelId)
                            ?.querySelector("ol")
                            ?.focus(),
                        );
                      }
                    }}
                  >
                    {group.length > 1 ? (
                      group.length
                    ) : (
                      <Icon name={icon} size={12} />
                    )}
                    {inlineLabel && (
                      <span
                        className="day-switch-label"
                        style={{ maxWidth: labelWidth }}
                        aria-hidden="true"
                      >
                        {inlineLabel}
                      </span>
                    )}
                    {group.length > 1 && colors.length > 0 && (
                      <span className="group-key-colors" aria-hidden="true">
                        {colors.map((color) => (
                          <i key={color} className={`tag-${color}`} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {expanded ? (
              <div
                className="day-group-panel"
                id={groupPanelId}
                role="region"
                aria-labelledby={groupPanelId + "-title"}
              >
                <div className="day-group-heading">
                  <strong id={groupPanelId + "-title"}>
                    {t("{0} events", expanded.length)} ·{" "}
                    {groupTimeRange(expanded)}
                  </strong>
                  <button
                    className="day-group-close"
                    type="button"
                    onClick={closeGroup}
                    aria-label={t("Close event group")}
                    title={t("Close event group")}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <ol
                  className="day-group-events"
                  aria-label={t("{0} events", expanded.length)}
                  tabIndex={0}
                >
                  {expanded.map((m) => (
                    <li key={m.event.id}>
                      {detail(m.event, clock(m.at, true), true)}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              active?.row.id === row.id &&
              detail(active.mark.event, clock(active.mark.at, true))
            )}
          </div>
        );
      })}
      {used.size > 0 && (
        <div className="day-chart-legend">
          {[...used].map((state) => (
            <span key={state ?? "unknown"}>
              <i className={"day-swatch seg-" + (state ?? "unknown")} />
              {t(state ? labels[state] : "Unknown state")}
            </span>
          ))}
        </div>
      )}
      {rows.some((r) => r.id === "plug:unknown") && (
        <p>
          {t("Home Monitor could not match these events to a specific plug.")}
        </p>
      )}
      {keys.size > 0 && (
        <div className="day-key-legend" aria-label={t("Key tags")}>
          {Array.from(keys, ([user, color]) => (
            <span key={user}>
              <i className={`key-tag-badge tag-${color}`}>
                <Icon name="key" size={12} />
              </i>
              {user} · {t(color[0].toUpperCase() + color.slice(1))}
            </span>
          ))}
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="day-unplaced">
          <label>
            {t("Uncertain event time")}{" "}
            <select
              value={
                unplaced.some((e) => e.id === selectedId) ? selectedId : ""
              }
              onChange={(e) =>
                select(e.target.value ? { id: e.target.value } : null)
              }
            >
              <option value="">{t("Select an event")}</option>
              {unplaced.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.localTime ?? t("Time not reported")} · {t(e.description)}
                </option>
              ))}
            </select>
          </label>
          {unplaced
            .filter((e) => e.id === selectedId)
            .map((e) => (
              <div key={e.id}>
                {detail(e, e.localTime ?? t("Time not reported"))}
              </div>
            ))}
        </div>
      )}
      {!changes.length && !unplaced.length && (
        <p className="activity-day-empty">
          {t("No activity available for this day.")}
        </p>
      )}
      {data.until > data.start && data.until < data.end && (
        <p>{t("History through {0}", clock(data.until))}</p>
      )}
    </section>
  );
}
