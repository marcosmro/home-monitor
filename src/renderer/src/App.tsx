import { useLanguage } from "./i18n";
import { Tooltip } from "./Tooltip";
import { HouseMap } from "./HouseMap";
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
  const { t } = useLanguage();
  const text = temperatureText(average.value);
  return (
    <span
      className={house ? "house-temperature" : "room-temperature"}
      aria-label={t(
        "{0} average: {1}. {2}. {3} of {4} sensors with usable temperatures.",
        house ? t("House") : t("Room"),
        average.value === undefined ? t("Unavailable") : `${text} Celsius`,
        average.source === "api" ? t("API average") : t("Calculated average"),
        average.used,
        average.total,
      )}
      title={t(
        "{0}. {1} usable readings / {2} sensors. Includes unfiltered room/house inventory. Offline and stale readings excluded from calculated averages.",
        average.source === "api"
          ? t("Average supplied by Sector Alarm")
          : t("Mean of available sensor readings"),
        average.used,
        average.total,
      )}
    >
      {house && <Icon name="temperature" size={21} />}
      <span className="average-value">
        {text}
        {house && average.value !== undefined && <small>C</small>}
      </span>
      <span className="average-caption">
        {house && <strong>{t("House average")}</strong>}
        <small>
          {average.value === undefined
            ? t("Unavailable")
            : average.source === "api"
              ? t("Reported avg")
              : t("Calc avg")}
          {house && t(" · {0}/{1} readings", average.used, average.total)}
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
  const { t } = useLanguage();
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
          aria-label={t("Close dialog")}
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
  const { t, setLanguage } = useLanguage();
  const [snap, setSnap] = useState<Snapshot>();
  const [prefs, setPrefs] = useState(defaults);
  const [view, setView] = useState<
    "overview" | "activity" | "settings" | "cameras" | "map"
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
  const [savedAccount, setSavedAccount] = useState<{ email: string } | null>(
    null,
  );
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [otherAccount, setOtherAccount] = useState(false);
  useEffect(() => {
    if (!connect) return;
    let cancelled = false;
    setSavedAccount(null);
    setOtherAccount(false);
    setCheckingAccount(true);
    Promise.resolve()
      .then(() => bridge.savedAccount())
      .then(
        (account) => {
          if (!cancelled) setSavedAccount(account);
        },
        () => {
          if (!cancelled) setSavedAccount(null);
        },
      )
      .finally(() => {
        if (!cancelled) setCheckingAccount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connect]);
  const [demoChosen, setDemoChosen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [panels, setPanels] = useState<Array<{ id: string; name: string }>>([]);
  const [now, setNow] = useState(Date.now());
  const [eventFilter, setEventFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void bridge.snapshot().then((s) => setSnap(structuredClone(s)));
    void bridge.preferences().then((p) => {
      setPrefs(p);
      setLanguage(p.language === "es" ? "es" : "en");
    });
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
  async function openAccount(result: Array<{ id: string; name: string }>) {
    setPanels(result);
    setPassword("");
    if (result.length === 0)
      throw new Error(t("No properties were found for this account."));
    if (result.length === 1) {
      const next = await bridge.select(result[0].id);
      setSnap(structuredClone(next));
      setConnect(false);
      setDemoChosen(false);
      setView("overview");
    }
  }
  function save(p: Preferences) {
    setLanguage(p.language === "es" ? "es" : "en");
    setPrefs(p);
    void bridge.savePreferences(p).catch((e) => setError(e.message));
  }
  if (!snap)
    return (
      <div className="loading">
        <Icon name="home" size={36} />
        <h1>{t("Opening your home…")}</h1>
        <p>{t("Loading the last available state.")}</p>
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
      `${displayDevice(d, prefs)} ${d.original} ${loc.floor} ${loc.room} ${t(typeLabel(d.type))}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
    );
  });
  const groups = new Map<string, Device[]>();
  for (const d of filtered) {
    const key =
      group === "floor" ? location(d, prefs).floor : t(typeLabel(d.type));
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
  const welcome = snap.demo && !demoChosen;
  return (
    <div className={welcome ? "welcome" : `app ${prefs.density}`}>
      {welcome ? (
        <main className="welcome-card">
          <Icon name="home" size={40} />
          <h1>{t("Welcome to Home Monitor")}</h1>
          <p>
            {t(
              "Connect your home or explore an example. Choose how you’d like to start.",
            )}
          </p>
          <div className="welcome-options">
            <section>
              <h2>{t("Your home")}</h2>
              <p>
                {t(
                  "Sign in with your Sector Alarm account to see your home’s live status and devices.",
                )}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setPanels([]);
                  setConnect(true);
                }}
              >
                {t("Log in to my account")}
              </button>
            </section>
            <section>
              <h2>{t("Explore the demo")}</h2>
              <p>
                {t(
                  "Try Home Monitor with simulated sensors and activity. No account needed.",
                )}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const next = await bridge.demo();
                    setDemoChosen(true);
                    setView("overview");
                    return next;
                  })
                }
              >
                {t("Start demo mode")}
              </button>
            </section>
          </div>
          {!window.home && (
            <p className="note">
              {t(
                "Account login is available in the desktop app. You can explore demo mode here.",
              )}
            </p>
          )}
          {error && !connect && (
            <p className="warning-text" role="alert">
              {error}
            </p>
          )}
        </main>
      ) : (
        <>
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
                ["overview", "grid", t("House overview")],
                ["map", "layers", t("House map")],
                ["cameras", "camera", t("Cameras")],
                ["activity", "clock", t("Activity")],
                ["settings", "settings", t("Settings")],
              ].map(([v, icon, label]) => (
                <Tooltip key={v} label={label}>
                  <button
                    className={view === v ? "active" : ""}
                    onClick={() => setView(v as typeof view)}
                    aria-current={view === v ? "page" : undefined}
                    aria-label={label}
                  >
                    <Icon name={icon} size={21} />
                    <span className="sr-only">
                      {v === "overview" ? t("Home") : label}
                    </span>
                  </button>
                </Tooltip>
              ))}
            </div>
            <div className="rail-bottom">
              <button
                aria-label={t("Toggle light and dark theme")}
                title={t("Toggle theme")}
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
                <Icon
                  name={prefs.theme === "dark" ? "sun" : "moon"}
                  size={20}
                />
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
                {snap.demo ? t("DEMO HOME") : t("LIVE ACCOUNT")}
              </span>
              <div className="house-time">
                <span>{madrid(new Date(now).toISOString())}</span>
                <small>Europe/Madrid</small>
              </div>
              <button
                className="icon-button refresh"
                disabled={busy || pending}
                title={t("Refresh available data (rate limited)")}
                aria-label={t("Refresh data")}
                onClick={() => void perform(() => bridge.refresh())}
              >
                <Icon name="refresh" />
              </button>
            </header>
            <section
              className={`alarm-strip mode-${snap.mode} ${triggered ? "danger" : ""}`}
              aria-label={t("Alarm status")}
            >
              <div className="alarm-symbol">
                <Icon name={triggered ? "alert" : "shield"} size={29} />
              </div>
              <div className="alarm-copy">
                <div className="alarm-title">
                  <h1>
                    {triggered
                      ? t("Sensor alarm reported")
                      : t(modeLabel[snap.mode])}
                  </h1>
                  {stale && (
                    <span className="pill amber">{t("Last known")}</span>
                  )}
                </div>
                <p>
                  {triggered
                    ? t(
                        "Check the affected sensor and the official alarm service.",
                      )
                    : snap.mode === "armed"
                      ? t("Full arming mode reported by the system.")
                      : snap.mode === "partial"
                        ? t("Partial arming mode reported by the system.")
                        : snap.mode === "disarmed"
                          ? t("The intrusion alarm is not armed.")
                          : t(
                              "The current alarm mode could not be established.",
                            )}
                </p>
              </div>
              <div className="connection">
                <span
                  className={
                    stale || snap.online !== true ? "warning-text" : "good-text"
                  }
                >
                  <Icon
                    name={snap.online === false ? "alert" : "wifi"}
                    size={15}
                  />
                  {stale
                    ? t("Update delayed")
                    : snap.online === true
                      ? t("Panel connected")
                      : snap.online === false
                        ? t("Panel offline")
                        : t("Connection unknown")}
                </span>
                <small>
                  {t("State checked")} {madrid(snap.statusAt)} · Madrid
                </small>
              </div>
              <div className="alarm-actions">
                {snap.areas.length > 1 && (
                  <select
                    aria-label={t("Alarm area")}
                    value={area}
                    onChange={(e) => setArea(+e.target.value)}
                  >
                    {snap.areas.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name} · {t(modeLabel[a.mode])}
                      </option>
                    ))}
                  </select>
                )}
                {snap.readOnly ? (
                  <button onClick={() => setView("settings")}>
                    <Icon name="lock" size={14} /> {t("Read-only")}
                  </button>
                ) : (
                  <>
                    <button
                      disabled={
                        pending || busy || stale || snap.online !== true
                      }
                      onClick={() => {
                        setArea(snap.areas[0]?.id || 0);
                        setCommand(
                          snap.mode === "armed" && snap.areas[0]?.partial
                            ? "partialArm"
                            : "arm",
                        );
                      }}
                    >
                      {snap.mode === "armed"
                        ? t("Change mode")
                        : t("Arm system")}
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
                      {t("Disarm")}
                    </button>
                  </>
                )}
              </div>
            </section>
            {snap.demo && (
              <div className="demo-notice">
                <span>
                  <span className="demo-dot" />{" "}
                  {t(
                    "Simulated home · 48 example sensors · no connection to your alarm",
                  )}
                </span>
                <button onClick={() => setConnect(true)}>
                  {t("Connect your home")} <Icon name="arrow" size={13} />
                </button>
              </div>
            )}
            {error && (
              <div className="banner error" role="alert">
                <Icon name="alert" />
                <span>{error}</span>
                <button
                  aria-label={t("Dismiss error")}
                  onClick={() => setError("")}
                >
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
                        sending: t("Sending"),
                        awaiting: t("Awaiting confirmation"),
                        confirmed: t("Confirmed"),
                        failed: t("Failed"),
                        unknown: t("Outcome unknown"),
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
                    {t("Reconcile state")}
                  </button>
                )}
              </div>
            )}
            <main>
              {view === "map" && (
                <HouseMap
                  key={`${snap.demo}:${snap.panelId}`}
                  snap={snap}
                  prefs={prefs}
                />
              )}
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
                        {t("Your whole house")}{" "}
                        <span>
                          {snap.devices.length} {t("sensors")}
                        </span>
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
                          placeholder={t("Find a sensor or room")}
                          aria-label={t("Find a sensor or room")}
                        />
                        <kbd>⌘ K</kbd>
                      </label>
                      <select
                        aria-label={t("Group sensors")}
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                      >
                        <option value="floor">{t("By floor & room")}</option>
                        <option value="type">{t("By device type")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="overview-toolbar">
                    <div className="filters">
                      {[
                        ["all", t("All sensors"), snap.devices.length, "grid"],
                        ["open", t("Open"), open, "door-open"],
                        ["attention", t("Attention"), attention, "alert"],
                        ["battery", t("Low battery"), low, "battery"],
                        ["offline", t("Offline"), offline, "wifi-off"],
                      ].map(([id, label, count, icon]) => (
                        <button
                          key={id}
                          className={`${filter === id ? "selected" : ""} ${id === "attention" && attention ? "attention-filter" : ""}`}
                          aria-pressed={filter === id}
                          onClick={() => setFilter(String(id))}
                        >
                          <Icon name={String(icon)} size={16} />
                          {label}
                          <span>{count}</span>
                        </button>
                      ))}
                    </div>
                    <div className="display-options">
                      <select
                        aria-label={t("Display names")}
                        value={prefs.names}
                        onChange={(e) =>
                          save({
                            ...prefs,
                            names: e.target.value as Preferences["names"],
                          })
                        }
                      >
                        <option value="spanish">Nombres en español</option>
                        <option value="original">{t("Original names")}</option>
                      </select>
                      <Tooltip label={t("Density: {0}", t(prefs.density))}>
                        <button
                          title={t("Toggle density")}
                          aria-label={t("Density: {0}", t(prefs.density))}
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
                          <span className="sr-only">
                            {prefs.density === "compact"
                              ? t("Compact")
                              : t("Comfortable")}
                          </span>
                        </button>
                      </Tooltip>
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
                        t("Inventory may be incomplete · ")}
                      {filtered.length === snap.devices.length
                        ? t(
                            "Showing all {0} available sensors",
                            snap.devices.length,
                          )
                        : t(
                            "Showing {0} of {1} · {2} hidden by filters",
                            filtered.length,
                            snap.devices.length,
                            snap.devices.length - filtered.length,
                          )}
                      {(filter !== "all" || search) && (
                        <button
                          onClick={() => {
                            setFilter("all");
                            setSearch("");
                          }}
                        >
                          {t("Clear filters")}
                        </button>
                      )}
                    </span>
                    <span>
                      {t("Activity ≠ health")}{" "}
                      <span className="legend-dot green" /> {t("Closed")}{" "}
                      <span className="legend-dot amber-dot" /> {t("Open")}{" "}
                      <span className="legend-dot red" /> {t("Alarm")}
                    </span>
                  </div>
                  <div className="scroll-hint">
                    {t(
                      "Smaller window? Scroll the page to review all sensors. Groups remain expanded.",
                    )}
                  </div>
                  <div
                    className={`sensor-layout ${detail ? "with-detail" : ""}`}
                  >
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
                              <span>{t("DEVICE")}</span>
                              <span>°C</span>
                              <span>{t("ACTIVITY")}</span>
                              <span>{t("HEALTH")}</span>
                            </div>
                            {[...rooms].map(([key, ds]) => {
                              const first = ds[0],
                                loc = location(first, prefs);
                              const roomDevices = allRooms.get(key) || ds;
                              const duplicateName =
                                [...allRooms.values()].filter(
                                  (items) =>
                                    location(items[0], prefs).floor ===
                                      loc.floor &&
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
                                      {group === "type"
                                        ? `${loc.floor} · `
                                        : ""}
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
                                      d.stale ||
                                      age(d.fetchedAt, now) > 1200000;
                                    return (
                                      <button
                                        key={d.id}
                                        className={`sensor-row ${selected === d.id ? "selected" : ""} ${d.alarm ? "alarmed" : ""}`}
                                        onClick={() => setSelected(d.id)}
                                        aria-label={`${displayDevice(d, prefs)}, ${t(typeLabel(d.type))}, ${t(state)}, ${t(health)}${old ? t(", stale") : ""}`}
                                      >
                                        <Tooltip label={t(typeLabel(d.type))}>
                                          <span
                                            className={`sensor-glyph type-${deviceIcon(d.type)}`}
                                          >
                                            <Icon
                                              name={deviceIcon(d.type)}
                                              size={16}
                                            />
                                          </span>
                                        </Tooltip>
                                        <span
                                          className="sensor-name"
                                          title={`${displayDevice(d, prefs)} · ${t(typeLabel(d.type))}`}
                                        >
                                          {displayDevice(d, prefs)}
                                          <small>
                                            {t(typeLabel(d.type))}
                                            {old ? t(" · stale") : ""}
                                          </small>
                                        </span>
                                        <span
                                          className={`sensor-temperature ${temperatureIsStale(d, snap, now) ? "last-known" : ""}`}
                                          aria-label={
                                            d.temperature === undefined
                                              ? t("Temperature not reported")
                                              : t(
                                                  "{0} degrees Celsius{1}",
                                                  d.temperature.toFixed(1),
                                                  temperatureIsStale(
                                                    d,
                                                    snap,
                                                    now,
                                                  )
                                                    ? t(", last known")
                                                    : "",
                                                )
                                          }
                                          title={
                                            d.temperature === undefined
                                              ? t("Temperature not reported")
                                              : t(
                                                  "{0}Fetched {1} Madrid. Sensor report time unavailable.",
                                                  temperatureIsStale(
                                                    d,
                                                    snap,
                                                    now,
                                                  )
                                                    ? t(
                                                        "Last known temperature. ",
                                                      )
                                                    : "",
                                                  madrid(
                                                    d.temperatureFetchedAt ||
                                                      d.fetchedAt,
                                                    true,
                                                  ),
                                                )
                                          }
                                        >
                                          {temperatureText(d.temperature)}
                                          {d.temperature !== undefined &&
                                            temperatureIsStale(
                                              d,
                                              snap,
                                              now,
                                            ) && <Icon name="clock" size={9} />}
                                        </span>
                                        <Tooltip label={t(state)}>
                                          <span
                                            className={`activity-state ${state === "Open" ? "open" : state === "Alarm" ? "alarm" : state === "Closed" ? "closed" : "unknown"}`}
                                          >
                                            <Icon
                                              name={
                                                state === "Closed"
                                                  ? "check"
                                                  : state === "Open"
                                                    ? "door-open"
                                                    : state === "Alarm"
                                                      ? "alert"
                                                      : state === "Last known"
                                                        ? "clock"
                                                        : "minus"
                                              }
                                              size={14}
                                            />
                                            <span className="sr-only">
                                              {t(state)}
                                            </span>
                                          </span>
                                        </Tooltip>
                                        <Tooltip
                                          label={`${t(health)}${old ? ` · ${t("Stale")}` : ""}`}
                                        >
                                          <span
                                            className={`health ${health === "OK" ? "healthy" : health === "Unknown" ? "unknown" : "issue"}`}
                                            title={t(
                                              "{0}. {1}Fetched {2} Madrid. Sensor report time not supplied.",
                                              t(health),
                                              old ? t("Stale fetch. ") : "",
                                              madrid(d.fetchedAt, true),
                                            )}
                                          >
                                            {old ? (
                                              <>
                                                <Icon name="clock" size={12} />
                                                <span>
                                                  {health === "OK"
                                                    ? t("Stale")
                                                    : health === "Low battery"
                                                      ? t("Low")
                                                      : health ===
                                                          "Critical battery"
                                                        ? t("Critical")
                                                        : t(health)}
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
                                                        ? "wifi-off"
                                                        : health === "Unknown"
                                                          ? "info"
                                                          : "alert"
                                                  }
                                                  size={12}
                                                />
                                                <span>
                                                  {health === "Low battery"
                                                    ? t("Low")
                                                    : health ===
                                                        "Critical battery"
                                                      ? t("Critical")
                                                      : t(health)}
                                                </span>
                                              </>
                                            )}
                                          </span>
                                        </Tooltip>
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
                              ? t("No matching sensors")
                              : t("No sensor inventory available")}
                          </h3>
                          <p>
                            {snap.devices.length
                              ? t("Try another name or clear your filters.")
                              : t(
                                  "Connection and capability details appear above. Missing devices are not treated as healthy.",
                                )}
                          </p>
                        </div>
                      )}
                    </div>
                    {detail && (
                      <aside
                        className="detail-panel"
                        aria-label={t("Sensor details")}
                      >
                        <div className="panel-heading">
                          <span className="eyebrow">{t("SENSOR DETAILS")}</span>
                          <button
                            className="icon-button"
                            onClick={() => setSelected(undefined)}
                            aria-label={t("Close sensor details")}
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
                              t("Temperature"),
                              detail.temperature === undefined
                                ? t("Not reported")
                                : `${temperatureText(detail.temperature)}C${temperatureIsStale(detail, snap, now) ? t(" · last known") : ""}`,
                            ],
                            [
                              t("Temperature fetched"),
                              madrid(detail.temperatureFetchedAt, true),
                            ],
                            [t("Activity"), t(deviceState(detail))],
                            [
                              t("Mounted on"),
                              detail.mount
                                ? `${prefs.names === "spanish" ? (detail.mount === "window" ? "Ventana" : "Puerta") : detail.mount === "window" ? t("Window") : t("Door")}${detail.mountIndex !== undefined ? ` ${detail.mountIndex}` : ""}`
                                : t("Not reported"),
                            ],
                            [t("Device health"), t(deviceHealth(detail))],
                            [
                              t("Battery"),
                              detail.batteryLow === undefined
                                ? t("Not reported")
                                : detail.batteryLow
                                  ? t("Low")
                                  : t("No low-battery flag"),
                            ],
                            [t("Tamper"), t("Not supplied by API")],
                            [t("Last change"), madrid(detail.changedAt, true)],
                            [t("Data fetched"), madrid(detail.fetchedAt, true)],
                            [t("Last sensor report"), t("Not supplied by API")],
                            [t("Original name"), detail.original],
                            [t("Device type"), detail.type],
                            [t("Stable ID"), detail.id],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="note">
                          {t(
                            "All times Europe/Madrid. A successful fetch does not establish when the sensor last reported.",
                          )}
                        </p>
                        <div className="local-edit">
                          <h3>{t("Local names & groups")}</h3>
                          <p>{t("Saved on this computer only.")}</p>
                          {[
                            ["name", t("Friendly name")],
                            ["spanish", "Nombre en español"],
                            ["floor", t("Floor group")],
                            ["room", t("Room group")],
                          ].map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <input
                                value={
                                  prefs.aliases[detail.id]?.[key as "name"] ||
                                  ""
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
                      {t(
                        "“Not reported” means activity is unavailable. Health flags are separate.",
                      )}{" "}
                      {prefs.density === "comfortable" || detail
                        ? t(
                            "Scroll to review every sensor; none are paginated or collapsed.",
                          )
                        : t(
                            "At smaller window heights, scroll to review every sensor.",
                          )}
                    </span>
                    <span>
                      {t("Contacts fetched")} {madrid(snap.contactsAt)} · Madrid
                    </span>
                  </div>
                  <section className="recent">
                    <div>
                      <Icon name="clock" size={17} />
                      <h3>{t("Recent activity")}</h3>
                      <span>Europe/Madrid</span>
                      <button onClick={() => setView("activity")}>
                        {t("View history")} <Icon name="arrow" size={13} />
                      </button>
                    </div>
                    <div className="recent-items">
                      {snap.events.slice(0, 3).map((e) => (
                        <article key={e.id}>
                          <time>
                            {e.time
                              ? madrid(e.time)
                              : e.localTime || t("Unknown time")}
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
                    <h2>{t("Activity history")}</h2>
                    <select
                      aria-label={t("Filter activity")}
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
                    >
                      <option value="all">{t("All events")}</option>
                      <option value="alarm">{t("Alarm events")}</option>
                      <option value="health">
                        {t("Device & connection health")}
                      </option>
                    </select>
                  </div>
                  <p>
                    {t("All times in Europe/Madrid ·")} {visibleEvents.length}{" "}
                    {t("shown from")} {snap.events.length} {t("loaded /")}{" "}
                    {snap.totalEvents}{" "}
                    {t(
                      "total records. Latest 80 records available in this version.",
                    )}
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
                            {e.user
                              ? t("By {0}", e.user)
                              : t("Actor not supplied")}{" "}
                            · <time>{eventTime(e)}</time> · Madrid
                          </p>
                        </div>
                      </article>
                    ))}
                    {!visibleEvents.length && (
                      <div className="empty">
                        {t("No matching activity available.")}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {view === "settings" && (
                <section className="settings-page">
                  <div className="section-heading">
                    <div>
                      <h2>{t("Settings")}</h2>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section>
                      <h3>
                        <Icon name="wifi" /> {t("Account & connection")}
                      </h3>
                      <p>
                        {snap.demo
                          ? t("Explore safely with simulated data.")
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
                          ? t("Connect Sector Alarm")
                          : t("Choose account / property")}
                      </button>
                      {!snap.demo && (
                        <>
                          <div className="alarm-controls-card">
                            <div className="alarm-controls-heading">
                              <strong>{t("Alarm controls")}</strong>
                              <Tooltip
                                label={t(
                                  "Enabling controls lets you arm, partially arm (if supported), or disarm your alarm from this app. It does not change the alarm state. Each command still requires your panel code and explicit confirmation. Disabling controls returns the app to read-only mode; it does not disarm your alarm.",
                                )}
                              >
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={t("About alarm controls")}
                                >
                                  <Icon name="info" size={16} />
                                </button>
                              </Tooltip>
                            </div>
                            <span
                              className="alarm-controls-status"
                              role="status"
                            >
                              <Icon
                                name={snap.readOnly ? "lock" : "shield"}
                                size={14}
                              />
                              {snap.readOnly
                                ? t("Disabled · Read-only")
                                : t("Enabled · Panel code required")}
                            </span>
                            <p>
                              {snap.readOnly
                                ? t(
                                    "View your home without changing the alarm. Enable controls to arm or disarm from this app.",
                                  )
                                : t(
                                    "You can arm or disarm from the overview. Each command requires your panel code and confirmation.",
                                  )}
                            </p>
                            <button
                              type="button"
                              className={
                                snap.readOnly ? "primary" : "secondary"
                              }
                              disabled={pending || busy}
                              onClick={() =>
                                void perform(() =>
                                  bridge.readOnly(!snap.readOnly),
                                )
                              }
                            >
                              {snap.readOnly
                                ? t("Enable alarm controls")
                                : t("Disable alarm controls")}
                            </button>
                          </div>
                          <button
                            disabled={pending || busy}
                            onClick={() =>
                              void perform(async () => {
                                const next = await bridge.logout();
                                setDemoChosen(false);
                                setPanels([]);
                                setEmail("");
                                setPassword("");
                                setView("overview");
                                return next;
                              })
                            }
                          >
                            {t("Disconnect & forget saved account")}
                          </button>
                        </>
                      )}
                      <BudgetNotice snap={snap} available />
                      <dl>
                        <div>
                          <dt>{t("Request budget")}</dt>
                          <dd>
                            {snap.demo
                              ? t("Demo — no requests")
                              : t(
                                  "{0} / {1} this hour",
                                  snap.requests,
                                  snap.requestBudget?.override
                                    ? t("uncapped")
                                    : "44",
                                )}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Alarm refresh")}</dt>
                          <dd>{t("Every 3 minutes")}</dd>
                        </div>
                        <div>
                          <dt>{t("Sensor refresh")}</dt>
                          <dd>{t("Every 15 minutes")}</dd>
                        </div>
                        <div>
                          <dt>{t("Activity refresh")}</dt>
                          <dd>{t("Every 10 minutes")}</dd>
                        </div>
                      </dl>
                      <p className="note">
                        {t(
                          "Polling is not real time. The API's community-observed limit is shared with the phone app.",
                        )}
                      </p>
                    </section>
                    <section>
                      <h3>
                        <Icon name="sun" /> {t("Appearance & names")}
                      </h3>
                      <label>
                        {t("Language")}
                        <select
                          value={prefs.language || "en"}
                          onChange={(e) =>
                            save({
                              ...prefs,
                              language: e.target.value as "en" | "es",
                            })
                          }
                        >
                          <option value="en" lang="en">
                            English
                          </option>
                          <option value="es" lang="es">
                            Español
                          </option>
                        </select>
                      </label>
                      <label>
                        {t("Appearance")}
                        <select
                          value={prefs.theme}
                          onChange={(e) =>
                            save({
                              ...prefs,
                              theme: e.target.value as Preferences["theme"],
                            })
                          }
                        >
                          <option value="light">
                            {t("Light · Limestone")}
                          </option>
                          <option value="dark">{t("Dark · Midnight")}</option>
                          <option value="system">{t("Follow system")}</option>
                        </select>
                      </label>
                      <label>
                        {t("Sensor density")}
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
                            {t("Compact · whole-house view")}
                          </option>
                          <option value="comfortable">
                            {t("Comfortable · larger rows")}
                          </option>
                        </select>
                      </label>
                      <label>
                        {t("Display names")}
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
                            {t("Spanish names, original fallback")}
                          </option>
                          <option value="original">
                            {t("Original names")}
                          </option>
                        </select>
                      </label>
                      <p className="note">
                        {t(
                          "Select any sensor to edit its local aliases, floor, and room. Custom names are preserved; remote alarm configuration is never renamed.",
                        )}
                      </p>
                      <dl>
                        <div>
                          <dt>{t("House time zone")}</dt>
                          <dd>{t("Europe/Madrid · automatic DST")}</dd>
                        </div>
                        <div>
                          <dt>{t("Desktop notifications")}</dt>
                          <dd>{t("Not implemented")}</dd>
                        </div>
                      </dl>
                    </section>
                    {snap.demo && (
                      <section className="scenario-settings">
                        <h3>
                          <Icon name="layers" /> {t("Demo conditions")}
                        </h3>
                        <p>
                          {t(
                            "Inspect how the application handles incomplete information.",
                          )}
                        </p>
                        <div className="scenario-buttons">
                          {[
                            ["normal", t("Mixed sensor states")],
                            ["stale", t("Stale connection")],
                            ["offline", t("Panel offline")],
                            ["partial", t("Partial refresh failure")],
                            ["expired", t("Expired session")],
                            ["triggered", t("Sensor alarm")],
                            ["unknown-command", t("Unknown command outcome")],
                            ["failed-command", t("Rejected command")],
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
        </>
      )}
      {command && (
        <Modal
          title={
            snap.demo ? t("Simulate alarm command") : t("Confirm alarm command")
          }
          onClose={() => {
            if (!busy) {
              setCommand(undefined);
              setCode("");
            }
          }}
        >
          <p>
            {snap.demo
              ? t("This affects the demo only.")
              : t("This will change the alarm at {0}.", snap.name)}
          </p>
          <label>
            {t("Requested mode")}
            <select
              value={command}
              onChange={(e) => setCommand(e.target.value as Action)}
            >
              <option value="arm">{t("Fully armed")}</option>
              {snap.areas.find((a) => a.id === area)?.partial && (
                <option value="partialArm">{t("Partially armed")}</option>
              )}
              <option value="disarm">
                {t("Disarmed — intrusion protection off")}
              </option>
            </select>
          </label>
          {snap.areas.length > 1 && (
            <label>
              {t("Alarm area")}
              <select value={area} onChange={(e) => setArea(+e.target.value)}>
                {snap.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {t(modeLabel[a.mode])}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!snap.demo && (
            <label>
              {t("Panel code")}
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
            {t(
              "The application waits for a matching system state before marking the command confirmed.",
            )}
          </p>
          <div className="dialog-actions">
            <button
              disabled={busy}
              onClick={() => {
                setCommand(undefined);
                setCode("");
              }}
            >
              {t("Cancel")}
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
              {t("Confirm")}{" "}
              {command === "disarm"
                ? t("disarm")
                : command === "arm"
                  ? t("full arming")
                  : t("partial arming")}
            </button>
          </div>
        </Modal>
      )}
      {connect && (
        <Modal
          title={t("Connect your home")}
          onClose={() => {
            if (!busy) {
              setConnect(false);
              setPassword("");
              setPanels([]);
              setError("");
            }
          }}
        >
          <BudgetNotice snap={snap} />
          <p>
            {t(
              "Sign in with your Sector Alarm account. Your home connects in read-only mode.",
            )}
          </p>
          {!window.home && (
            <div className="banner warning">
              {t(
                "Browser preview is demo only. Open the desktop app to connect.",
              )}
            </div>
          )}
          {checkingAccount ? (
            <p role="status">{t("Checking for a saved account…")}</p>
          ) : savedAccount && !otherAccount && panels.length === 0 ? (
            <section className="saved-account-card">
              <span className="saved-account-label">
                {t("Saved on this computer")}
              </span>
              <strong className="saved-account-email">
                {savedAccount.email}
              </strong>
              <p>
                {t(
                  "Continue with this account using your securely saved credentials.",
                )}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    setPanels([]);
                    await openAccount(await bridge.savedLogin());
                  })
                }
              >
                {busy
                  ? t("Connecting…")
                  : t("Continue as {0}", savedAccount.email)}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setOtherAccount(true);
                  setEmail("");
                  setPassword("");
                  setError("");
                }}
              >
                {t("Use another account")}
              </button>
            </section>
          ) : panels.length === 0 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  setPanels([]);
                  await openAccount(
                    await bridge.login(email, password, remember),
                  );
                });
              }}
            >
              <label>
                {t("Email")}
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("Password")}
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
                {t("Remember securely on this computer")}
              </label>
              <div className="dialog-actions">
                <button className="primary" disabled={busy || !window.home}>
                  {busy ? t("Connecting…") : t("Sign in")}
                </button>
              </div>
              {savedAccount && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setOtherAccount(false);
                    setPassword("");
                    setError("");
                  }}
                >
                  {t("Back to saved account")}
                </button>
              )}
            </form>
          ) : null}
          {error && (
            <p className="warning-text" role="alert">
              {error}
            </p>
          )}
          {panels.length > 0 && (
            <div className="property-list">
              <h3>{t("Select a property")}</h3>
              {panels.map((p) => (
                <button
                  disabled={busy}
                  key={p.id}
                  onClick={() =>
                    void perform(async () => {
                      const s = await bridge.select(p.id);
                      setConnect(false);
                      setDemoChosen(false);
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
