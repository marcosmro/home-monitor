import { BudgetNotice } from "./BudgetNotice";
import { Cameras } from "./Cameras";
import { useEffect, useRef, useState } from "react";
import type { Action, Device, Preferences, Snapshot } from "../../shared/model";
import {
  defaults,
  displayDevice,
  location,
  deviceState,
  deviceHealth,
  needsAttention,
  modeLabel,
  age,
} from "../../shared/model";
import {
  averageTemperature,
  temperatureText,
  temperatureIsStale,
  roomGroupKey,
  type Average,
} from "../../shared/climate";
import { madrid, eventTime } from "../../shared/time";
import { bridge } from "./bridge";
import { Icon, deviceIcon, typeLabel } from "./icons";

function AverageReading({
  average,
  house = false,
}: {
  average: Average;
  house?: boolean;
}) {
  const text = temperatureText(average.value);
  return (
    <span
      className={house ? "house-temperature" : "room-temperature"}
      aria-label={`${house ? "House" : "Room"} average: ${average.value === undefined ? "unavailable" : `${text} Celsius`}. ${average.source === "api" ? "API average" : "Calculated average"}. ${average.used} of ${average.total} sensors with usable temperatures.`}
      title={`${average.source === "api" ? "Average supplied by Sector Alarm" : "Mean of available sensor readings"}. ${average.used} usable readings / ${average.total} sensors. Includes unfiltered room/house inventory. Offline and stale readings excluded from calculated averages.`}
    >
      {house && <Icon name="temperature" size={21} />}
      <span className="average-value">
        {text}
        {house && average.value !== undefined && <small>C</small>}
      </span>
      <span className="average-caption">
        {house && <strong>House average</strong>}
        <small>
          {average.value === undefined
            ? "Unavailable"
            : average.source === "api"
              ? "Reported avg"
              : "Calc avg"}
          {house && ` · ${average.used}/${average.total} readings`}
        </small>
      </span>
    </span>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const [snap, setSnap] = useState<Snapshot>();
  const [prefs, setPrefs] = useState(defaults);
  const [view, setView] = useState<
    "overview" | "activity" | "settings" | "cameras"
  >("overview");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("floor");
  const [selected, setSelected] = useState<string>();
  const [command, setCommand] = useState<Action>();
  const [area, setArea] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connect, setConnect] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [panels, setPanels] = useState<Array<{ id: string; name: string }>>([]);
  const [now, setNow] = useState(Date.now());
  const [eventFilter, setEventFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void bridge.snapshot().then((s) => setSnap(structuredClone(s)));
    void bridge.preferences().then(setPrefs);
    const unsub = bridge.subscribe((s) => setSnap(structuredClone(s)));
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : prefs.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setView("overview");
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setSelected(undefined);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function perform(fn: () => Promise<any>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (result?.devices) setSnap(structuredClone(result));
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save(p: Preferences) {
    setPrefs(p);
    void bridge.savePreferences(p).catch((e) => setError(e.message));
  }
  if (!snap)
    return (
      <div className="loading">
        <Icon name="home" size={36} />
        <h1>Opening your home…</h1>
        <p>Loading the last available state.</p>
      </div>
    );
  const pending = ["sending", "awaiting", "unknown"].includes(
    snap.command.phase,
  );
  const stale = age(snap.statusAt, now) > 240000 || !!snap.warnings.status;
  const triggered = snap.devices.some((d) => d.alarm);
  const open = snap.devices.filter(
    (d) => d.closed === false && !d.offline,
  ).length;
  const attention = snap.devices.filter(needsAttention).length;
  const low = snap.devices.filter(
    (d) => d.batteryLow || d.batteryCritical,
  ).length;
  const offline = snap.devices.filter((d) => d.offline).length;
  const filtered = snap.devices.filter((d) => {
    const loc = location(d, prefs);
    return (
      (filter === "all" ||
        (filter === "open" && d.closed === false) ||
        (filter === "attention" && needsAttention(d)) ||
        (filter === "battery" && (d.batteryLow || d.batteryCritical)) ||
        (filter === "offline" && d.offline)) &&
      `${displayDevice(d, prefs)} ${d.original} ${loc.floor} ${loc.room} ${typeLabel(d.type)}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
    );
  });
  const groups = new Map<string, Device[]>();
  for (const d of filtered) {
    const key =
      group === "floor" ? location(d, prefs).floor : typeLabel(d.type);
    groups.set(key, [...(groups.get(key) || []), d]);
  }
  const houseAverage = averageTemperature(snap, snap.devices, now);
  const allRooms = new Map<string, Device[]>();
  for (const d of snap.devices) {
    const key = roomGroupKey(d, prefs);
    allRooms.set(key, [...(allRooms.get(key) || []), d]);
  }
  const detail = snap.devices.find((d) => d.id === selected);
  const visibleEvents = snap.events.filter(
    (e) =>
      eventFilter === "all" ||
      (eventFilter === "alarm" && /arm|alarm/.test(e.type)) ||
      (eventFilter === "health" &&
        /battery|internet|mains|supervis/.test(e.type)),
  );
  const eventDescription = (e: Snapshot["events"][0]) => {
    const d = snap.devices.find((d) => d.id === e.deviceId);
    return `${e.description}${d ? " · " + displayDevice(d, prefs) : ""}`;
  };
  return (
    <div className={`app ${prefs.density}`}>
      <aside className="rail">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("overview");
          }}
          aria-label="Home Monitor"
        >
          <Icon name="home" size={25} />
        </a>
        <div className="rail-nav">
          {[
            ["overview", "grid", "House overview"],
            ["cameras", "camera", "Cameras"],
            ["activity", "clock", "Activity"],
            ["settings", "settings", "Settings"],
          ].map(([v, icon, label]) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v as typeof view)}
              title={label}
              aria-label={label}
            >
              <Icon name={icon} size={21} />
              <span>{v === "overview" ? "Home" : label}</span>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <button
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
            onClick={() =>
              save({
                ...prefs,
                theme:
                  document.documentElement.dataset.theme === "dark"
                    ? "light"
                    : "dark",
              })
            }
          >
            <Icon name={prefs.theme === "dark" ? "sun" : "moon"} size={20} />
          </button>
          <span className="avatar">MM</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="property">
            <span className="eyebrow">HOME MONITOR</span>
            <button
              className="property-button"
              onClick={() => {
                setView("settings");
              }}
            >
              {snap.name}
              <Icon name="chevron" size={13} />
            </button>
          </div>
          <span className={`mode-badge ${snap.demo ? "demo" : "live"}`}>
            {snap.demo ? "DEMO HOME" : "LIVE ACCOUNT"}
          </span>
          <div className="house-time">
            <span>{madrid(new Date(now).toISOString())}</span>
            <small>Europe/Madrid</small>
          </div>
          <button
            className="icon-button refresh"
            disabled={busy || pending}
            title="Refresh available data (rate limited)"
            aria-label="Refresh data"
            onClick={() => void perform(() => bridge.refresh())}
          >
            <Icon name="refresh" />
          </button>
        </header>
        <section
          className={`alarm-strip ${triggered ? "danger" : ""}`}
          aria-label="Alarm status"
        >
          <div className="alarm-symbol">
            <Icon name={triggered ? "alert" : "shield"} size={29} />
          </div>
          <div className="alarm-copy">
            <div className="alarm-title">
              <h1>
                {triggered ? "Sensor alarm reported" : modeLabel[snap.mode]}
              </h1>
              {stale && <span className="pill amber">Last known</span>}
            </div>
            <p>
              {triggered
                ? "Check the affected sensor and the official alarm service."
                : snap.mode === "armed"
                  ? "Full arming mode reported by the system."
                  : snap.mode === "partial"
                    ? "Partial arming mode reported by the system."
                    : snap.mode === "disarmed"
                      ? "The intrusion alarm is not armed."
                      : "The current alarm mode could not be established."}
            </p>
          </div>
          <div className="connection">
            <span
              className={
                stale || snap.online !== true ? "warning-text" : "good-text"
              }
            >
              <Icon name={snap.online === false ? "alert" : "wifi"} size={15} />
              {stale
                ? "Update delayed"
                : snap.online === true
                  ? "Panel connected"
                  : snap.online === false
                    ? "Panel offline"
                    : "Connection unknown"}
            </span>
            <small>State checked {madrid(snap.statusAt)} · Madrid</small>
          </div>
          <div className="alarm-actions">
            {snap.areas.length > 1 && (
              <select
                aria-label="Alarm area"
                value={area}
                onChange={(e) => setArea(+e.target.value)}
              >
                {snap.areas.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} · {modeLabel[a.mode]}
                  </option>
                ))}
              </select>
            )}
            {snap.readOnly ? (
              <button onClick={() => setView("settings")}>
                <Icon name="lock" size={14} /> Read-only
              </button>
            ) : (
              <>
                <button
                  disabled={pending || busy || stale || snap.online !== true}
                  onClick={() => {
                    setArea(snap.areas[0]?.id || 0);
                    setCommand(
                      snap.mode === "armed" && snap.areas[0]?.partial
                        ? "partialArm"
                        : "arm",
                    );
                  }}
                >
                  {snap.mode === "armed" ? "Change mode" : "Arm system"}
                </button>
                <button
                  className="secondary"
                  disabled={
                    pending ||
                    busy ||
                    stale ||
                    snap.online !== true ||
                    snap.mode === "disarmed"
                  }
                  onClick={() => {
                    setCode("");
                    setCommand("disarm");
                  }}
                >
                  Disarm
                </button>
              </>
            )}
          </div>
        </section>
        {snap.demo && (
          <div className="demo-notice">
            <span>
              <span className="demo-dot" /> Simulated home · 48 example sensors
              · no connection to your alarm
            </span>
            <button onClick={() => setConnect(true)}>
              Connect your home <Icon name="arrow" size={13} />
            </button>
          </div>
        )}
        {error && (
          <div className="banner error" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        <BudgetNotice snap={snap} />
        {Object.keys(snap.warnings).length > 0 && (
          <div className="banner warning" role="status">
            <Icon name="alert" />
            <span>
              {Object.entries(snap.warnings)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </span>
          </div>
        )}
        {snap.command.phase !== "idle" && (
          <div
            className={`banner ${snap.command.phase === "confirmed" ? "success" : "warning"}`}
            role="status"
          >
            <Icon
              name={snap.command.phase === "confirmed" ? "check" : "clock"}
            />
            <strong>
              {
                (
                  {
                    sending: "Sending",
                    awaiting: "Awaiting confirmation",
                    confirmed: "Confirmed",
                    failed: "Failed",
                    unknown: "Outcome unknown",
                  } as const
                )[snap.command.phase]
              }
            </strong>
            <span>
              {snap.command.message}
              {snap.command.at && ` · ${madrid(snap.command.at)} Madrid`}
            </span>
            {snap.command.phase === "unknown" && (
              <button
                disabled={busy}
                onClick={() => void perform(() => bridge.reconcile())}
              >
                Reconcile state
              </button>
            )}
          </div>
        )}
        <main>
          {view === "cameras" && (
            <Cameras
              key={`${snap.demo}:${snap.panelId}`}
              snap={snap}
              prefs={prefs}
            />
          )}
          {view === "overview" && (
            <>
              <div className="section-heading">
                <div className="overview-title">
                  <h2>
                    Your whole house <span>{snap.devices.length} sensors</span>
                  </h2>
                  <AverageReading average={houseAverage} house />
                </div>
                <div className="heading-options">
                  <label className="search">
                    <Icon name="search" size={15} />
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Find a sensor or room"
                      aria-label="Find a sensor or room"
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                  <select
                    aria-label="Group sensors"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    <option value="floor">By floor & room</option>
                    <option value="type">By device type</option>
                  </select>
                </div>
              </div>
              <div className="overview-toolbar">
                <div className="filters">
                  {[
                    ["all", "All sensors", snap.devices.length],
                    ["open", "Open", open],
                    ["attention", "Attention", attention],
                    ["battery", "Low battery", low],
                    ["offline", "Offline", offline],
                  ].map(([id, label, count]) => (
                    <button
                      key={id}
                      className={`${filter === id ? "selected" : ""} ${id === "attention" && attention ? "attention-filter" : ""}`}
                      onClick={() => setFilter(String(id))}
                    >
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="display-options">
                  <select
                    aria-label="Display names"
                    value={prefs.names}
                    onChange={(e) =>
                      save({
                        ...prefs,
                        names: e.target.value as Preferences["names"],
                      })
                    }
                  >
                    <option value="spanish">Nombres en español</option>
                    <option value="original">Original names</option>
                  </select>
                  <button
                    title="Toggle density"
                    aria-label={`Density: ${prefs.density}`}
                    onClick={() =>
                      save({
                        ...prefs,
                        density:
                          prefs.density === "compact"
                            ? "comfortable"
                            : "compact",
                      })
                    }
                  >
                    <Icon name="layers" size={15} />
                    <span>
                      {prefs.density === "compact" ? "Compact" : "Comfortable"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="coverage">
                <span>
                  {(snap.warnings.telemetry ||
                    snap.warnings.contacts ||
                    snap.warnings.inventory ||
                    snap.warnings.cameras ||
                    snap.warnings.smoke ||
                    snap.warnings.flood) &&
                    "Inventory may be incomplete · "}
                  {filtered.length === snap.devices.length
                    ? `Showing all ${snap.devices.length} available sensors`
                    : `Showing ${filtered.length} of ${snap.devices.length} · ${snap.devices.length - filtered.length} hidden by filters`}
                  {(filter !== "all" || search) && (
                    <button
                      onClick={() => {
                        setFilter("all");
                        setSearch("");
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </span>
                <span>
                  Activity ≠ health <span className="legend-dot green" /> Closed{" "}
                  <span className="legend-dot amber-dot" /> Open{" "}
                  <span className="legend-dot red" /> Alarm
                </span>
              </div>
              <div className="scroll-hint">
                Smaller window? Scroll the page to review all sensors. Groups
                remain expanded.
              </div>
              <div className={`sensor-layout ${detail ? "with-detail" : ""}`}>
                <div className="floor-grid">
                  {[...groups].map(([name, devices], index) => {
                    const rooms = new Map<string, Device[]>();
                    devices.forEach((d) => {
                      const r = roomGroupKey(d, prefs);
                      rooms.set(r, [...(rooms.get(r) || []), d]);
                    });
                    return (
                      <section className="floor" key={name}>
                        <div className="floor-heading">
                          <span className="floor-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <h3>{name}</h3>
                          <span>{devices.length}</span>
                        </div>
                        <div className="column-labels">
                          <span>DEVICE</span>
                          <span>°C</span>
                          <span>ACTIVITY</span>
                          <span>HEALTH</span>
                        </div>
                        {[...rooms].map(([key, ds]) => {
                          const first = ds[0],
                            loc = location(first, prefs);
                          const roomDevices = allRooms.get(key) || ds;
                          const duplicateName =
                            [...allRooms.values()].filter(
                              (items) =>
                                location(items[0], prefs).floor === loc.floor &&
                                location(items[0], prefs).room === loc.room,
                            ).length > 1;
                          const room =
                            loc.room +
                            (duplicateName && first.roomNumber !== undefined
                              ? ` ${first.roomNumber}`
                              : "");
                          return (
                            <div className="room" key={key}>
                              <div className="room-heading">
                                <span>
                                  {group === "type" ? `${loc.floor} · ` : ""}
                                  {room}
                                </span>
                                <AverageReading
                                  average={averageTemperature(
                                    snap,
                                    roomDevices,
                                    now,
                                    key,
                                  )}
                                />
                                <small>{ds.length}</small>
                              </div>
                              {ds.map((d) => {
                                const health = deviceHealth(d),
                                  state = deviceState(d);
                                const old =
                                  d.stale || age(d.fetchedAt, now) > 1200000;
                                return (
                                  <button
                                    key={d.id}
                                    className={`sensor-row ${selected === d.id ? "selected" : ""} ${d.alarm ? "alarmed" : ""}`}
                                    onClick={() => setSelected(d.id)}
                                    aria-label={`${displayDevice(d, prefs)}, ${typeLabel(d.type)}, ${state}, ${health}${old ? ", stale" : ""}`}
                                  >
                                    <span className="sensor-glyph">
                                      <Icon
                                        name={deviceIcon(d.type)}
                                        size={16}
                                      />
                                    </span>
                                    <span
                                      className="sensor-name"
                                      title={displayDevice(d, prefs)}
                                    >
                                      {displayDevice(d, prefs)}
                                      <small>
                                        {typeLabel(d.type)}
                                        {old ? " · stale" : ""}
                                      </small>
                                    </span>
                                    <span
                                      className={`sensor-temperature ${temperatureIsStale(d, snap, now) ? "last-known" : ""}`}
                                      aria-label={
                                        d.temperature === undefined
                                          ? "Temperature not reported"
                                          : `${d.temperature.toFixed(1)} degrees Celsius${temperatureIsStale(d, snap, now) ? ", last known" : ""}`
                                      }
                                      title={
                                        d.temperature === undefined
                                          ? "Temperature not reported"
                                          : `${temperatureIsStale(d, snap, now) ? "Last known temperature. " : ""}Fetched ${madrid(d.temperatureFetchedAt || d.fetchedAt, true)} Madrid. Sensor report time unavailable.`
                                      }
                                    >
                                      {temperatureText(d.temperature)}
                                      {d.temperature !== undefined &&
                                        temperatureIsStale(d, snap, now) && (
                                          <Icon name="clock" size={9} />
                                        )}
                                    </span>
                                    <span
                                      className={`activity-state ${state === "Open" ? "open" : state === "Alarm" ? "alarm" : state === "Closed" ? "closed" : "unknown"}`}
                                    >
                                      {state === "Closed" && (
                                        <Icon name="check" size={11} />
                                      )}
                                      <span>
                                        {state === "Not reported"
                                          ? "Not reported"
                                          : state}
                                      </span>
                                    </span>
                                    <span
                                      className={`health ${health === "OK" ? "healthy" : health === "Unknown" ? "unknown" : "issue"}`}
                                      title={`${health}. ${old ? "Stale fetch. " : ""}Fetched ${madrid(d.fetchedAt, true)} Madrid. Sensor report time not supplied.`}
                                    >
                                      {old ? (
                                        <>
                                          <Icon name="clock" size={12} />
                                          <span>
                                            {health === "OK"
                                              ? "Stale"
                                              : health === "Low battery"
                                                ? "Low"
                                                : health === "Critical battery"
                                                  ? "Critical"
                                                  : health}
                                          </span>
                                        </>
                                      ) : health === "OK" ? (
                                        <>
                                          <Icon name="check" size={12} />
                                          <span>OK</span>
                                        </>
                                      ) : (
                                        <>
                                          <Icon
                                            name={
                                              health.includes("battery")
                                                ? "battery"
                                                : health === "Offline"
                                                  ? "wifi"
                                                  : health === "Unknown"
                                                    ? "info"
                                                    : "alert"
                                            }
                                            size={12}
                                          />
                                          <span>
                                            {health === "Low battery"
                                              ? "Low"
                                              : health === "Critical battery"
                                                ? "Critical"
                                                : health}
                                          </span>
                                        </>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="empty">
                      <Icon name="search" size={30} />
                      <h3>
                        {snap.devices.length
                          ? "No matching sensors"
                          : "No sensor inventory available"}
                      </h3>
                      <p>
                        {snap.devices.length
                          ? "Try another name or clear your filters."
                          : "Connection and capability details appear above. Missing devices are not treated as healthy."}
                      </p>
                    </div>
                  )}
                </div>
                {detail && (
                  <aside className="detail-panel" aria-label="Sensor details">
                    <div className="panel-heading">
                      <span className="eyebrow">SENSOR DETAILS</span>
                      <button
                        className="icon-button"
                        onClick={() => setSelected(undefined)}
                        aria-label="Close sensor details"
                      >
                        <Icon name="close" size={17} />
                      </button>
                    </div>
                    <div className="detail-icon">
                      <Icon name={deviceIcon(detail.type)} size={28} />
                    </div>
                    <h2>{displayDevice(detail, prefs)}</h2>
                    <p>
                      {location(detail, prefs).floor} /{" "}
                      {location(detail, prefs).room}
                    </p>
                    <dl>
                      {[
                        [
                          "Temperature",
                          detail.temperature === undefined
                            ? "Not reported"
                            : `${temperatureText(detail.temperature)}C${temperatureIsStale(detail, snap, now) ? " · last known" : ""}`,
                        ],
                        [
                          "Temperature fetched",
                          madrid(detail.temperatureFetchedAt, true),
                        ],
                        ["Activity", deviceState(detail)],
                        [
                          "Mounted on",
                          detail.mount
                            ? `${prefs.names === "spanish" ? (detail.mount === "window" ? "Ventana" : "Puerta") : detail.mount === "window" ? "Window" : "Door"}${detail.mountIndex !== undefined ? ` ${detail.mountIndex}` : ""}`
                            : "Not reported",
                        ],
                        ["Device health", deviceHealth(detail)],
                        [
                          "Battery",
                          detail.batteryLow === undefined
                            ? "Not reported"
                            : detail.batteryLow
                              ? "Low"
                              : "No low-battery flag",
                        ],
                        ["Tamper", "Not supplied by API"],
                        ["Last change", madrid(detail.changedAt, true)],
                        ["Data fetched", madrid(detail.fetchedAt, true)],
                        ["Last sensor report", "Not supplied by API"],
                        ["Original name", detail.original],
                        ["Device type", detail.type],
                        ["Stable ID", detail.id],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="note">
                      All times Europe/Madrid. A successful fetch does not
                      establish when the sensor last reported.
                    </p>
                    <div className="local-edit">
                      <h3>Local names &amp; groups</h3>
                      <p>Saved on this computer only.</p>
                      {[
                        ["name", "Friendly name"],
                        ["spanish", "Nombre en español"],
                        ["floor", "Floor group"],
                        ["room", "Room group"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            value={
                              prefs.aliases[detail.id]?.[key as "name"] || ""
                            }
                            placeholder={
                              key === "spanish"
                                ? detail.spanish || detail.original
                                : key === "floor"
                                  ? location(detail, prefs).floor
                                  : key === "room"
                                    ? location(detail, prefs).room
                                    : detail.original
                            }
                            onChange={(e) =>
                              save({
                                ...prefs,
                                aliases: {
                                  ...prefs.aliases,
                                  [detail.id]: {
                                    ...prefs.aliases[detail.id],
                                    [key]: e.target.value,
                                  },
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </aside>
                )}
              </div>
              <div className="sensor-footnote">
                <Icon name="info" size={13} />
                <span>
                  “Not reported” means activity is unavailable. Health flags are
                  separate.{" "}
                  {prefs.density === "comfortable" || detail
                    ? "Scroll to review every sensor; none are paginated or collapsed."
                    : "At smaller window heights, scroll to review every sensor."}
                </span>
                <span>Contacts fetched {madrid(snap.contactsAt)} · Madrid</span>
              </div>
              <section className="recent">
                <div>
                  <Icon name="clock" size={17} />
                  <h3>Recent activity</h3>
                  <span>Europe/Madrid</span>
                  <button onClick={() => setView("activity")}>
                    View history <Icon name="arrow" size={13} />
                  </button>
                </div>
                <div className="recent-items">
                  {snap.events.slice(0, 3).map((e) => (
                    <article key={e.id}>
                      <time>
                        {e.time
                          ? madrid(e.time)
                          : e.localTime || "Unknown time"}
                      </time>
                      <span>{eventDescription(e)}</span>
                      {e.user && <small>{e.user}</small>}
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {view === "activity" && (
            <section className="activity-page">
              <div className="section-heading">
                <h2>Activity history</h2>
                <select
                  aria-label="Filter activity"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                >
                  <option value="all">All events</option>
                  <option value="alarm">Alarm events</option>
                  <option value="health">Device & connection health</option>
                </select>
              </div>
              <p>
                All times in Europe/Madrid · {visibleEvents.length} shown from{" "}
                {snap.events.length} loaded / {snap.totalEvents} total records.
                Latest 80 records available in this version.
              </p>
              <div className="timeline">
                {visibleEvents.map((e) => (
                  <article key={e.id}>
                    <span className="timeline-icon">
                      <Icon name={/arm/.test(e.type) ? "shield" : "info"} />
                    </span>
                    <div>
                      <h3>{eventDescription(e)}</h3>
                      <p>
                        {e.user ? `By ${e.user}` : "Actor not supplied"} ·{" "}
                        <time>{eventTime(e)}</time> · Madrid
                      </p>
                    </div>
                  </article>
                ))}
                {!visibleEvents.length && (
                  <div className="empty">No matching activity available.</div>
                )}
              </div>
            </section>
          )}
          {view === "settings" && (
            <section className="settings-page">
              <div className="section-heading">
                <div>
                  <h2>Settings</h2>
                </div>
              </div>
              <div className="settings-grid">
                <section>
                  <h3>
                    <Icon name="wifi" /> Account & connection
                  </h3>
                  <p>
                    {snap.demo
                      ? "Explore safely with simulated data."
                      : "Connected to " +
                        snap.name +
                        ". Live controls start disabled."}
                  </p>
                  <button
                    className="primary"
                    disabled={pending || busy}
                    onClick={() => setConnect(true)}
                  >
                    {snap.demo
                      ? "Connect Sector Alarm"
                      : "Choose account / property"}
                  </button>
                  {!snap.demo && (
                    <>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={!snap.readOnly}
                          disabled={pending}
                          onChange={(e) =>
                            void perform(() =>
                              bridge.readOnly(!e.target.checked),
                            )
                          }
                        />{" "}
                        Enable live alarm controls
                      </label>
                      <p className="note">
                        Each command still requires a panel code and explicit
                        confirmation. No commands are sent when you connect.
                      </p>
                      <button
                        disabled={pending || busy}
                        onClick={() => void perform(() => bridge.logout())}
                      >
                        Disconnect & forget saved account
                      </button>
                    </>
                  )}
                  <BudgetNotice snap={snap} available />
                  <dl>
                    <div>
                      <dt>Request budget</dt>
                      <dd>
                        {snap.demo
                          ? "Demo — no requests"
                          : `${snap.requests} / ${snap.requestBudget?.override ? "uncapped" : "44"} this hour`}
                      </dd>
                    </div>
                    <div>
                      <dt>Alarm refresh</dt>
                      <dd>Every 3 minutes</dd>
                    </div>
                    <div>
                      <dt>Sensor refresh</dt>
                      <dd>Every 15 minutes</dd>
                    </div>
                    <div>
                      <dt>Activity refresh</dt>
                      <dd>Every 10 minutes</dd>
                    </div>
                  </dl>
                  <p className="note">
                    Polling is not real time. The API's community-observed limit
                    is shared with the phone app.
                  </p>
                </section>
                <section>
                  <h3>
                    <Icon name="sun" /> Appearance & names
                  </h3>
                  <label>
                    Appearance
                    <select
                      value={prefs.theme}
                      onChange={(e) =>
                        save({
                          ...prefs,
                          theme: e.target.value as Preferences["theme"],
                        })
                      }
                    >
                      <option value="light">Light · Limestone</option>
                      <option value="dark">Dark · Midnight</option>
                      <option value="system">Follow system</option>
                    </select>
                  </label>
                  <label>
                    Sensor density
                    <select
                      value={prefs.density}
                      onChange={(e) =>
                        save({
                          ...prefs,
                          density: e.target.value as Preferences["density"],
                        })
                      }
                    >
                      <option value="compact">
                        Compact · whole-house view
                      </option>
                      <option value="comfortable">
                        Comfortable · larger rows
                      </option>
                    </select>
                  </label>
                  <label>
                    Display names
                    <select
                      value={prefs.names}
                      onChange={(e) =>
                        save({
                          ...prefs,
                          names: e.target.value as Preferences["names"],
                        })
                      }
                    >
                      <option value="spanish">
                        Spanish names, original fallback
                      </option>
                      <option value="original">Original names</option>
                    </select>
                  </label>
                  <p className="note">
                    Select any sensor to edit its local aliases, floor, and
                    room. Custom names are preserved; remote alarm configuration
                    is never renamed.
                  </p>
                  <dl>
                    <div>
                      <dt>House time zone</dt>
                      <dd>Europe/Madrid · automatic DST</dd>
                    </div>
                    <div>
                      <dt>Desktop notifications</dt>
                      <dd>Not implemented</dd>
                    </div>
                  </dl>
                </section>
                {snap.demo && (
                  <section className="scenario-settings">
                    <h3>
                      <Icon name="layers" /> Demo conditions
                    </h3>
                    <p>
                      Inspect how the application handles incomplete
                      information.
                    </p>
                    <div className="scenario-buttons">
                      {[
                        ["normal", "Mixed sensor states"],
                        ["stale", "Stale connection"],
                        ["offline", "Panel offline"],
                        ["partial", "Partial refresh failure"],
                        ["expired", "Expired session"],
                        ["triggered", "Sensor alarm"],
                        ["unknown-command", "Unknown command outcome"],
                        ["failed-command", "Rejected command"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          disabled={pending || busy}
                          onClick={() =>
                            void perform(() => bridge.scenario(id))
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
      {command && (
        <Modal
          title={snap.demo ? "Simulate alarm command" : "Confirm alarm command"}
          onClose={() => {
            if (!busy) {
              setCommand(undefined);
              setCode("");
            }
          }}
        >
          <p>
            {snap.demo
              ? "This affects the demo only."
              : `This will change the alarm at ${snap.name}.`}
          </p>
          <label>
            Requested mode
            <select
              value={command}
              onChange={(e) => setCommand(e.target.value as Action)}
            >
              <option value="arm">Fully armed</option>
              {snap.areas.find((a) => a.id === area)?.partial && (
                <option value="partialArm">Partially armed</option>
              )}
              <option value="disarm">
                Disarmed — intrusion protection off
              </option>
            </select>
          </label>
          {snap.areas.length > 1 && (
            <label>
              Alarm area
              <select value={area} onChange={(e) => setArea(+e.target.value)}>
                {snap.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {modeLabel[a.mode]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!snap.demo && (
            <label>
              Panel code
              <input
                autoComplete="off"
                type="password"
                inputMode="numeric"
                maxLength={snap.codeLength}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <p className="note">
            The application waits for a matching system state before marking the
            command confirmed.
          </p>
          <div className="dialog-actions">
            <button
              disabled={busy}
              onClick={() => {
                setCommand(undefined);
                setCode("");
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                pending ||
                (!snap.demo && code.length !== snap.codeLength)
              }
              onClick={() => {
                const action = command;
                const pin = code;
                setCode("");
                setCommand(undefined);
                void perform(() => bridge.command(action, pin, area));
              }}
            >
              Confirm{" "}
              {command === "disarm"
                ? "disarm"
                : command === "arm"
                  ? "full arming"
                  : "partial arming"}
            </button>
          </div>
        </Modal>
      )}
      {connect && (
        <Modal
          title="Connect your home"
          onClose={() => {
            if (!busy) {
              setConnect(false);
              setPassword("");
            }
          }}
        >
          <BudgetNotice snap={snap} />
          <p>
            Your account connects read-only. Credentials are kept in the desktop
            process and optionally protected by the operating system.
          </p>
          {!window.home && (
            <div className="banner warning">
              Browser preview is demo only. Open the desktop app to connect.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                const result = await bridge.login(email, password, remember);
                setPanels(result);
                setPassword("");
              });
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />{" "}
              Remember securely on this computer
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                disabled={busy || !window.home}
                onClick={() =>
                  void perform(async () => setPanels(await bridge.savedLogin()))
                }
              >
                Use saved account
              </button>
              <button className="primary" disabled={busy || !window.home}>
                {busy ? "Connecting…" : "Sign in"}
              </button>
            </div>
          </form>
          {error && (
            <p className="warning-text" role="alert">
              {error}
            </p>
          )}
          {panels.length > 0 && (
            <div className="property-list">
              <h3>Select a property</h3>
              {panels.map((p) => (
                <button
                  disabled={busy}
                  key={p.id}
                  onClick={() =>
                    void perform(async () => {
                      const s = await bridge.select(p.id);
                      setConnect(false);
                      setView("overview");
                      return s;
                    })
                  }
                >
                  {p.name}
                  <Icon name="arrow" size={15} />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
