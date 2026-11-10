import { ActivityActionIcon, ActivityActor } from "./ActivityIdentity";
import { useEffect, useRef, useState } from "react";
import type { Device, Preferences, Snapshot } from "../../shared/model";
import { displayDevice } from "../../shared/model";
import {
  activityDay,
  calendarDays,
  canSelectActivityDay,
} from "../../shared/activity-calendar";
import { madrid } from "../../shared/time";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";

export function ActivityCalendar({
  snap,
  now,
  onHistory,
  sensor,
  selected,
  onSelectDate,
  sensorOnly,
}: {
  selected: string;
  onSelectDate: (day: string) => void;
  sensorOnly: boolean;
  sensor?: Device;
  snap: Snapshot;
  now: number;
  onHistory: () => void;
}) {
  const { t, language } = useLanguage();
  const today = madrid(new Date(now).toISOString(), true).slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(today.slice(0, 7));
  useEffect(() => {
    setMonth(selected.slice(0, 7));
  }, [selected]);
  const strip = useRef<HTMLDivElement>(null);
  const dateLabel = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", {
      ...options,
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  const days = new Map<string, Snapshot["events"]>();
  for (const event of snap.events) {
    if (sensorOnly && sensor && event.deviceId !== sensor.id) continue;
    const day = activityDay(event);
    if (day && day <= today) days.set(day, [...(days.get(day) || []), event]);
  }
  useEffect(() => {
    const el = strip.current;
    const active = el?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    );
    if (el && active)
      el.scrollLeft +=
        active.getBoundingClientRect().left -
        el.getBoundingClientRect().left -
        el.clientWidth / 2 +
        active.clientWidth / 2;
  }, [month, selected]);
  function moveMonth(delta: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    if (date.toISOString().slice(0, 7) > currentMonth) return;
    setMonth(date.toISOString().slice(0, 7));
    onSelectDate(date.toISOString().slice(0, 10));
  }
  return (
    <section
      className="home-activity activity-strip"
      aria-label={t("Home activity")}
    >
      <div className="strip-toolbar">
        <h3>
          <Icon name="clock" size={15} />
          {t("Activity strip")}
        </h3>
        <div className="calendar-month">
          <button
            aria-label={t("Previous month")}
            onClick={() => moveMonth(-1)}
          >
            ‹
          </button>
          <strong aria-live="polite">
            {dateLabel(`${month}-01`, { month: "long" })} {month.slice(0, 4)}
          </strong>
          <button
            aria-label={t("Next month")}
            disabled={month >= currentMonth}
            onClick={() => moveMonth(1)}
          >
            ›
          </button>
        </div>
        <button
          onClick={() => {
            setMonth(today.slice(0, 7));
            onSelectDate(today);
          }}
        >
          {t("Today")}
        </button>
        <button className="strip-history" onClick={onHistory}>
          {t("View history")} <Icon name="arrow" size={12} />
        </button>
      </div>
      <div
        className="calendar-days"
        ref={strip}
        aria-label={t("Activity days")}
      >
        {calendarDays(month)
          .filter((day): day is string => !!day)
          .map((day) => (
            <button
              key={day}
              disabled={day > today}
              title={day > today ? t("Future date") : undefined}
              className={`${days.has(day) ? "has-events" : ""} ${day === today ? "is-today" : ""}`}
              aria-pressed={day === selected}
              aria-current={day === today ? "date" : undefined}
              aria-label={`${dateLabel(day, { day: "numeric", month: "long", year: "numeric" })} · ${day > today ? t("Future date") : t("{0} events", days.get(day)?.length || 0)}`}
              onClick={() => {
                if (canSelectActivityDay(day, now)) onSelectDate(day);
              }}
            >
              <span>{Number(day.slice(-2))}</span>
              <i aria-hidden="true" />
            </button>
          ))}
      </div>
    </section>
  );
}

export function ActivityDay({
  snap,
  prefs,
  sensor,
  selected,
  sensorOnly,
  onScopeChange,
  onSelectSensor,
}: {
  snap: Snapshot;
  prefs: Preferences;
  sensor?: Device;
  selected: string;
  sensorOnly: boolean;
  onScopeChange: (enabled: boolean) => void;
  onSelectSensor: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const events = snap.events.filter(
    (event) =>
      activityDay(event) === selected &&
      (!sensorOnly || !sensor || event.deviceId === sensor.id),
  );
  return (
    <section className="activity-day">
      <div className="activity-day-heading">
        <h2>
          {new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${selected}T12:00:00Z`))}
        </h2>
        <p>Europe/Madrid</p>
      </div>
      {sensor && (
        <div
          className="calendar-scope-switch"
          role="group"
          aria-label={t("Activity scope")}
        >
          <button
            aria-pressed={!sensorOnly}
            onClick={() => onScopeChange(false)}
          >
            {t("Whole home")}
          </button>
          <button aria-pressed={sensorOnly} onClick={() => onScopeChange(true)}>
            {t("Selected sensor")}
          </button>
        </div>
      )}
      {sensor && sensorOnly && (
        <p className="calendar-sensor-label">
          {displayDevice(sensor, prefs)} · {t("Only explicitly linked events")}
        </p>
      )}
      <div className="calendar-event-list" aria-live="polite">
        {events.length ? (
          events.map((event) => (
            <article key={event.id}>
              <ActivityActionIcon event={event} />
              <div className="activity-event-content">
                <div className="activity-event-heading">
                  <strong>{t(event.description)}</strong>
                  <time dateTime={event.time}>
                    {event.time
                      ? madrid(event.time)
                      : event.localTime?.slice(11) || t("Unknown time")}
                  </time>
                </div>
                <ActivityActor event={event} people={snap.keyTagPeople} />
                {event.deviceId &&
                  snap.devices.some((d) => d.id === event.deviceId) && (
                    <button onClick={() => onSelectSensor(event.deviceId!)}>
                      {displayDevice(
                        snap.devices.find((d) => d.id === event.deviceId)!,
                        prefs,
                      )}{" "}
                      <Icon name="arrow" size={12} />
                    </button>
                  )}
              </div>
            </article>
          ))
        ) : (
          <div className="activity-day-empty">
            <Icon name="clock" size={26} />
            <h3>{t("No activity available for this day.")}</h3>
          </div>
        )}
      </div>
    </section>
  );
}
