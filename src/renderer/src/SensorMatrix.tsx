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
  // Keep columns stable while filtering; omit types absent from this house.
  const types = [...new Set(snap.devices.map((d) => d.type))];
  const roomTypes = new Map<string, Set<string>>();
  for (const device of snap.devices) {
    const key = roomGroupKey(device, prefs);
    if (!roomTypes.has(key)) roomTypes.set(key, new Set());
    roomTypes.get(key)!.add(device.type);
  }
  const columnWidths = types.map((type) => {
    const counts = new Map<string, number>();
    for (const d of snap.devices.filter((d) => d.type === type)) {
      const key = roomGroupKey(d, prefs);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Math.max(1, ...counts.values()) * 40 + 12;
  });
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
          {t("Closed")}
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
              {types.map((type, index) => (
                <th
                  key={type}
                  scope="col"
                  style={{ minWidth: columnWidths[index] }}
                >
                  <Tooltip label={t(typeLabel(type))}>
                    <span aria-label={t(typeLabel(type))}>
                      <Icon name={deviceIcon(type)} size={14} />
                      <span className="matrix-column-name">
                        {t(typeLabel(type))}
                      </span>
                    </span>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          {floors.map((floor) => (
            <tbody key={floor}>
              <tr className="matrix-floor-divider">
                <th scope="rowgroup" colSpan={types.length + 1}>
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
                      {types.map((type) => (
                        <td
                          key={type}
                          className={
                            roomTypes.get(key)?.has(type)
                              ? undefined
                              : "matrix-unavailable"
                          }
                          title={
                            roomTypes.get(key)?.has(type)
                              ? undefined
                              : t("No sensor of this type in this room")
                          }
                        >
                          {ds.some((d) => d.type === type) ? (
                            <div className="matrix-cell-stack">
                              {ds
                                .filter((d) => d.type === type)
                                .map((d) => {
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
                                        : state === "Closed"
                                          ? "closed"
                                          : "neutral";
                                  const hasTemperature = Number.isFinite(
                                    d.temperature,
                                  );
                                  const temperatureStale = temperatureIsStale(
                                    d,
                                    snap,
                                    now,
                                  );
                                  const label = `${displayDevice(d, prefs)} · ${t(state)} · ${t("Health")}: ${t(health)}${stale ? ` · ${t("Stale")}` : ""}${d.temperature !== undefined ? ` · ${temperatureText(d.temperature)}${temperatureIsStale(d, snap, now) ? ` (${t("Last known")})` : ""}` : ""}`;
                                  return (
                                    <Tooltip key={d.id} label={label}>
                                      <button
                                        className={`matrix-sensor ${tone} ${selected === d.id ? "is-selected" : ""}`}
                                        aria-pressed={selected === d.id}
                                        aria-label={label}
                                        onClick={() => onSelect(d.id)}
                                      >
                                        {hasTemperature ? (
                                          <span
                                            className={`matrix-temperature ${temperatureStale ? "is-stale" : ""}`}
                                          >
                                            {temperatureText(d.temperature)}
                                          </span>
                                        ) : (
                                          <Icon
                                            name={
                                              tone === "closed"
                                                ? "check"
                                                : tone === "alarm" ||
                                                    tone === "attention"
                                                  ? "alert"
                                                  : "minus"
                                            }
                                            size={13}
                                          />
                                        )}
                                      </button>
                                    </Tooltip>
                                  );
                                })}
                            </div>
                          ) : (
                            <span
                              className={
                                roomTypes.get(key)?.has(type)
                                  ? "matrix-empty"
                                  : "sr-only"
                              }
                              aria-label={t(
                                roomTypes.get(key)?.has(type)
                                  ? "Sensors hidden by current filters"
                                  : "No sensor of this type in this room",
                              )}
                            >
                              {roomTypes.get(key)?.has(type)
                                ? "·"
                                : t("No sensor of this type in this room")}
                            </span>
                          )}
                        </td>
                      ))}
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
