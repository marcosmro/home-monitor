import type { Device, Preferences, Snapshot } from "../../shared/model";
import {
  age,
  deviceHealth,
  deviceIsStale,
  deviceState,
  deviceTone,
  displayDevice,
  floorSections,
  location,
  needsAttention,
} from "../../shared/model";
import {
  roomGroupKey,
  temperatureIsStale,
  temperatureText,
} from "../../shared/climate";
import { inOrder, moveBeside, sortSensors } from "../../shared/order";
import { Icon, deviceIcon, typeLabel } from "./icons";
import { Tooltip } from "./Tooltip";
import { sensorCount, useLanguage } from "./i18n";

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
  house,
  onReorder,
}: {
  /** Saves a new order of the floor sections or of the room rows. */
  onReorder?: (order: { floorOrder?: string[]; roomOrder?: string[] }) => void;
  /** Top row for the whole home: totals, and a way back to every floor plan. */
  house?: { name: string; active: boolean; onSelect: () => void };
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
  const floorOf = (d: Device) => location(d, prefs).floor;
  // Orders cover the whole inventory, so a move made while filtering holds.
  const allFloors = floorSections(snap.devices, prefs);
  const floors = allFloors.filter((floor) =>
    devices.some((d) => floorOf(d) === floor),
  );
  const allRooms = inOrder(
    [...new Set(snap.devices.map((d) => roomGroupKey(d, prefs)))],
    (key) => key,
    prefs.roomOrder,
  );
  const orderedRooms = inOrder([...rooms], ([key]) => key, allRooms);
  /** Up and down buttons that swap an item with its visible neighbour. */
  const moveButtons = (
    name: string,
    key: string,
    visible: string[],
    all: string[],
    field: "floorOrder" | "roomOrder",
  ) => {
    const index = visible.indexOf(key);
    return (
      onReorder &&
      visible.length > 1 && (
        <span className="matrix-move">
          {([-1, 1] as const).map((step) => (
            <button
              key={step}
              aria-label={t(step < 0 ? "Move {0} up" : "Move {0} down", name)}
              title={t(step < 0 ? "Move up" : "Move down")}
              disabled={!visible[index + step]}
              onClick={() =>
                onReorder({
                  [field]: moveBeside(
                    all,
                    key,
                    visible[index + step],
                    step > 0,
                  ),
                })
              }
            >
              <Icon name="chevron" size={11} />
            </button>
          ))}
        </span>
      )
    );
  };
  return (
    <section className="matrix-panel" aria-label={t("Sensor matrix")}>
      <div className="matrix-intro">
        <h3>
          {t("Sensors by room")}{" "}
          <span className="matrix-total" aria-live="polite">
            {devices.length === snap.devices.length
              ? sensorCount(snap.devices.length, t)
              : t("{0} of {1} sensors", devices.length, snap.devices.length)}
          </span>
        </h3>
        <span className="matrix-key">
          <span>
            <i />
            {t("Healthy")}
          </span>
          <span>
            <i className="open" />
            {t("Open")}
          </span>
          <span>
            <i className="danger" />
            {t("Alarm / open while armed")}
          </span>
          <span>
            <i className="warm" />
            {t("Needs attention")}
          </span>
          <span>
            <i className="neutral" />
            {t("Unknown / stale")}
          </span>
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
                  minWidth: `${Math.max(12, ...snap.devices.map((d) => location(d, prefs).room.length + 2)) + (onReorder ? 5 : 0)}ch`,
                }}
              >
                {t("Room")}
              </th>
              <th scope="col">{t("Sensors")}</th>
            </tr>
          </thead>
          {house && (
            <tbody>
              <tr className="matrix-floor-divider matrix-house-row">
                <th scope="rowgroup" colSpan={2}>
                  <button
                    className="matrix-floor-link matrix-house-link"
                    aria-label={t("Show all floor plans of {0}", house.name)}
                    aria-pressed={house.active}
                    onClick={house.onSelect}
                  >
                    <Icon name="home" size={13} />
                    {house.name}
                  </button>
                  <small>
                    {sensorCount(snap.devices.length, t)}
                    {" · "}
                    {
                      snap.devices.filter(
                        (d) => d.closed === false && !d.offline,
                      ).length
                    }{" "}
                    {t("open")}
                    {" · "}
                    {snap.devices.filter(needsAttention).length}{" "}
                    {t("need attention")}
                    {snap.devices.some((d) => d.offline) &&
                      ` · ${snap.devices.filter((d) => d.offline).length} ${t("offline")}`}
                  </small>
                </th>
              </tr>
            </tbody>
          )}
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
                  {moveButtons(floor, floor, floors, allFloors, "floorOrder")}
                  <small>
                    {sensorCount(
                      devices.filter((d) => location(d, prefs).floor === floor)
                        .length,
                      t,
                    )}
                  </small>
                </th>
              </tr>

              {orderedRooms
                .filter(([, ds]) => location(ds[0], prefs).floor === floor)
                .map(([key, ds], _index, floorRooms) => {
                  const loc = location(ds[0], prefs);
                  const duplicates =
                    [...rooms.values()].filter(
                      (items) =>
                        location(items[0], prefs).floor === floor &&
                        location(items[0], prefs).room === loc.room,
                    ).length > 1;
                  const roomName = `${loc.room}${duplicates && ds[0].roomNumber !== undefined ? ` ${ds[0].roomNumber}` : ""}`;
                  return (
                    <tr
                      key={key}
                      className={
                        ds.some(
                          (d) =>
                            d.alarm ||
                            (d.closed === false && !d.offline && !d.plugState),
                        )
                          ? `has-open ${snap.mode === "armed" || ds.some((d) => d.alarm) ? "is-alert" : ""}`
                          : undefined
                      }
                    >
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
                        {moveButtons(
                          roomName,
                          key,
                          floorRooms.map(([roomKey]) => roomKey),
                          allRooms,
                          "roomOrder",
                        )}
                      </th>
                      <td>
                        <div className="matrix-cell-stack">
                          {sortSensors(ds, (d) => displayDevice(d, prefs)).map(
                            (d) => {
                              const state = deviceState(d),
                                health = deviceHealth(d);
                              const stale =
                                d.stale || age(d.fetchedAt, now) > 1200000;
                              const tone = deviceTone(d, {
                                stale: deviceIsStale(d, snap.online, now),
                                armed: snap.mode === "armed",
                              });
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
                                      tone === "open" ||
                                      tone === "open-armed" ||
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
                            },
                          )}
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
