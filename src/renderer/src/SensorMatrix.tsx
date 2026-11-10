import type { Device, Preferences, Snapshot } from "../../shared/model";
import {
  age,
  deviceHealth,
  deviceState,
  displayDevice,
  location,
  needsAttention,
} from "../../shared/model";
import {
  roomGroupKey,
  temperatureIsStale,
  temperatureText,
} from "../../shared/climate";
import { Icon, deviceIcon, typeLabel } from "./icons";
import { Tooltip } from "./Tooltip";
import { useLanguage } from "./i18n";

export function SensorMatrix({
  snap,
  devices,
  prefs,
  now,
  selected,
  onSelect,
  onSelectRoom,
  onSelectFloor,
  activeFloor,
}: {
  snap: Snapshot;
  devices: Device[];
  prefs: Preferences;
  now: number;
  selected?: string;
  onSelect: (id: string) => void;
  onSelectRoom: (device: Device) => void;
  onSelectFloor: (device: Device) => void;
  activeFloor?: string;
}) {
  const { t } = useLanguage();
  const rooms = new Map<string, Device[]>();
  for (const d of devices) {
    const key = roomGroupKey(d, prefs);
    rooms.set(key, [...(rooms.get(key) || []), d]);
  }
  const floors = [...new Set(devices.map((d) => location(d, prefs).floor))];
  return (
    <section className="matrix-panel" aria-label={t("Sensor matrix")}>
      <div className="matrix-intro">
        <h3>
          {t("Sensors by room")}{" "}
          <span className="matrix-total" aria-live="polite">
            {devices.length === snap.devices.length
              ? `${snap.devices.length} ${t("sensors")}`
              : t("{0} of {1} sensors", devices.length, snap.devices.length)}
          </span>
        </h3>
        <span className="matrix-key">
          <i />
          {t("Healthy")}
          <i className="warm" />
          {t("Open / attention")}
          <i className="danger" />
          {t("Alarm")}
          <i className="neutral" />
          {t("Unknown / stale")}
        </span>
      </div>
      <div
        className="matrix-floor-panel matrix-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("Sensor matrix")}
      >
        <table className="sensor-matrix">
          <caption className="sr-only">{t("Sensor matrix")}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  minWidth: `${Math.max(12, ...snap.devices.map((d) => location(d, prefs).room.length + 2))}ch`,
                }}
              >
                {t("Room")}
              </th>
              <th scope="col">{t("Sensors")}</th>
            </tr>
          </thead>
          {floors.map((floor) => (
            <tbody key={floor}>
              <tr className="matrix-floor-divider">
                <th scope="rowgroup" colSpan={2}>
                  <button
                    className="matrix-floor-link"
                    aria-label={t("Show floor {0}", floor)}
                    aria-pressed={activeFloor === floor}
                    onClick={() =>
                      onSelectFloor(
                        devices.find(
                          (d) => location(d, prefs).floor === floor,
                        )!,
                      )
                    }
                  >
                    <Icon name="layers" size={12} />
                    {floor}
                  </button>
                  <small>
                    {
                      devices.filter((d) => location(d, prefs).floor === floor)
                        .length
                    }{" "}
                    {t("sensors")}
                  </small>
                </th>
              </tr>

              {[...rooms]
                .filter(([, ds]) => location(ds[0], prefs).floor === floor)
                .map(([key, ds]) => {
                  const loc = location(ds[0], prefs);
                  const duplicates =
                    [...rooms.values()].filter(
                      (items) =>
                        location(items[0], prefs).floor === floor &&
                        location(items[0], prefs).room === loc.room,
                    ).length > 1;
                  return (
                    <tr key={key}>
                      <th scope="row" className="matrix-room">
                        <button
                          className="matrix-room-link"
                          onClick={() => onSelectRoom(ds[0])}
                          aria-label={t(
                            "Show {0}, {1} on floor plan",
                            loc.room,
                            loc.floor,
                          )}
                        >
                          {loc.room}
                          {duplicates && ds[0].roomNumber !== undefined
                            ? ` ${ds[0].roomNumber}`
                            : ""}
                        </button>
                      </th>
                      <td>
                        <div className="matrix-cell-stack">
                          {ds.map((d) => {
                            const state = deviceState(d),
                              health = deviceHealth(d);
                            const stale =
                              d.stale || age(d.fetchedAt, now) > 1200000;
                            const tone = d.alarm
                              ? "alarm"
                              : d.offline || stale || snap.online !== true
                                ? "unknown"
                                : needsAttention(d) || state === "Open"
                                  ? "attention"
                                  : health === "OK"
                                    ? "healthy"
                                    : "neutral";
                            const hasTemperature = Number.isFinite(
                              d.temperature,
                            );
                            const temperatureStale = temperatureIsStale(
                              d,
                              snap,
                              now,
                            );
                            const label = `${displayDevice(d, prefs)} · ${t(typeLabel(d.type))} · ${t(state)} · ${t("Health")}: ${t(health)}${stale ? ` · ${t("Stale")}` : ""}${d.temperature !== undefined ? ` · ${temperatureText(d.temperature)}${temperatureIsStale(d, snap, now) ? ` (${t("Last known")})` : ""}` : ""}`;
                            return (
                              <Tooltip key={d.id} label={label}>
                                <button
                                  className={`matrix-sensor ${tone} ${selected === d.id ? "is-selected" : ""}`}
                                  aria-pressed={selected === d.id}
                                  aria-label={label}
                                  onClick={() => onSelect(d.id)}
                                >
                                  <Icon name={deviceIcon(d.type)} size={14} />
                                  {(tone === "attention" ||
                                    tone === "alarm") && (
                                    <span
                                      className="matrix-sensor-alert"
                                      aria-hidden="true"
                                    >
                                      !
                                    </span>
                                  )}
                                  {hasTemperature && (
                                    <span
                                      className={`matrix-temperature ${temperatureStale ? "is-stale" : ""}`}
                                    >
                                      {temperatureText(d.temperature)}
                                    </span>
                                  )}
                                </button>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
      </div>
      {devices.length === 0 && (
        <div className="empty">
          <h3>
            {t(
              snap.devices.length
                ? "No matching sensors"
                : "No sensor inventory available",
            )}
          </h3>
          {snap.devices.length > 0 && (
            <p>{t("Clear filters to see all sensors.")}</p>
          )}
        </div>
      )}
    </section>
  );
}
