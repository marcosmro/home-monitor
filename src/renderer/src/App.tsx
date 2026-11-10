import { ActivityActionIcon, ActivityActor } from "./ActivityIdentity";
import { CameraInspector, useCameraLibrary } from "./CameraInspector";
import { isCamera } from "../../shared/cameras";
import { canSelectActivityDay } from "../../shared/activity-calendar";
import { SensorLocation } from "./SensorLocation";
import { ActivityCalendar, ActivityDay } from "./ActivityCalendar";
import { TemperatureSettings } from "./TemperatureSettings";
import { useLanguage } from "./i18n";
import { Tooltip } from "./Tooltip";
import { SensorMatrix } from "./SensorMatrix";
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
  type Average,
} from "../../shared/climate";
import { madrid, eventTime } from "../../shared/time";
import { bridge } from "./bridge";
import { Icon, deviceIcon } from "./icons";
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
  const [inspectorTab, setInspectorTab] = useState<
    "details" | "map" | "activity" | "photos"
  >("map");
  const [activityDate, setActivityDate] = useState(() =>
    madrid(new Date().toISOString(), true).slice(0, 10),
  );
  const [activitySensorOnly, setActivitySensorOnly] = useState(false);
  const inspectorRef = useRef<HTMLDivElement>(null);
  function revealInspector() {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    requestAnimationFrame(() => {
      const inspector = inspectorRef.current;
      inspector
        ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
        ?.focus({
          preventScroll: true,
        });
      inspector?.scrollIntoView({
        block: "start",
      });
    });
  }
  function showDay(day: string) {
    if (!canSelectActivityDay(day, Date.now())) return;
    setActivityDate(day);
    setInspectorTab("activity");
    requestAnimationFrame(() =>
      inspectorRef.current?.scrollIntoView({
        block: "nearest",
      }),
    );
  }
  const [selected, setSelected] = useState<string>();
  const [cameraFocus, setCameraFocus] = useState<string>();
  const selectedDevice = snap?.devices.find((d) => d.id === selected);
  const selectedCamera =
    selectedDevice && isCamera(selectedDevice) ? selectedDevice : undefined;
  const cameraLibrary = useCameraLibrary(
    selectedCamera?.id,
    `${snap?.demo}:${snap?.panelId}`,
    view === "overview",
  );
  useEffect(() => {
    if (inspectorTab === "photos" && !selectedCamera)
      setInspectorTab("details");
  }, [selectedCamera?.id, inspectorTab]);
  function openCameraControls() {
    setCameraFocus(selectedCamera?.id);
    setView("cameras");
  }
  const [roomFocus, setRoomFocus] = useState<Device>();
  const [floorFocus, setFloorFocus] = useState<Device>();
  useEffect(() => {
    if (selected) {
      setRoomFocus(undefined);
      setFloorFocus(undefined);
    }
  }, [selected]);
  const [command, setCommand] = useState<Action>();
  const [area, setArea] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connect, setConnect] = useState(false);
  const [openingProperty, setOpeningProperty] = useState(false);
  const [savedAccount, setSavedAccount] = useState<{
    email: string;
  } | null>(null);
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
  const [panels, setPanels] = useState<
    Array<{
      id: string;
      name: string;
    }>
  >([]);
  const [now, setNow] = useState(Date.now());
  const [eventFilter, setEventFilter] = useState("all");
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
      if (e.key === "Escape" && !e.defaultPrevented) setSelected(undefined);
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
  async function openAccount(
    result: Array<{
      id: string;
      name: string;
    }>,
  ) {
    setPanels(result);
    setPassword("");
    if (result.length === 0)
      throw new Error(t("No properties were found for this account."));
    const selected =
      result.find((p) => p.id === prefs.lastPanelId) || result[0];
    await selectProperty(selected.id);
  }
  async function selectProperty(id: string) {
    setConnect(false);
    setOpeningProperty(true);
    try {
      const next = await bridge.select(id);
      setSnap(structuredClone(next));
      save({
        ...prefs,
        lastPanelId: id,
      });
      setDemoChosen(false);
    } catch (error) {
      setConnect(true);
      throw error;
    } finally {
      setOpeningProperty(false);
    }
  }
  function save(p: Preferences) {
    setLanguage(p.language === "es" ? "es" : "en");
    setPrefs(p);
    void bridge.savePreferences(p).catch((e) => setError(e.message));
  }
  if (!snap || openingProperty)
    return (
      <div className="loading">
        <Icon name="home" size={36} />
        <h1>{t("Opening your home…")}</h1>
        <p>{t("Loading the last available state.")}</p>
      </div>
    );
  const homeName = (!snap.demo && prefs.homeNames?.[snap.panelId]) || snap.name;
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
  const filtered = snap.devices.filter(
    (d) =>
      filter === "all" ||
      (filter === "open" && d.closed === false) ||
      (filter === "attention" && needsAttention(d)) ||
      (filter === "battery" && (d.batteryLow || d.batteryCritical)) ||
      (filter === "offline" && d.offline),
  );
  const houseAverage = averageTemperature(snap, snap.devices, now);
  const detail = selectedDevice;
  const inspectorTabs = [
    ["details", "info", "Details"],
    ["map", "layers", "Floor plan"],
    ...(selectedCamera ? [["photos", "camera", "Photos"]] : []),
    ["activity", "clock", "Activity"],
  ] as Array<[typeof inspectorTab, string, string]>;
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
                  {homeName}
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
              {bridge.resetZoom && (
                <button
                  className="reset-zoom"
                  aria-label={t("Reset zoom to 100%")}
                  title={t("Reset zoom to 100% · ⌘0 / Ctrl+0")}
                  onClick={() => void perform(() => bridge.resetZoom!())}
                >
                  {t("Reset zoom")} · 100%
                </button>
              )}
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
                  initialSelectedId={selected}
                  onInspect={(id) => {
                    setSelected(id);
                    setInspectorTab("details");
                    setView("overview");
                  }}
                />
              )}
              {view === "cameras" && (
                <Cameras
                  key={`${snap.demo}:${snap.panelId}`}
                  snap={snap}
                  prefs={prefs}
                  initialCameraId={cameraFocus}
                  onInspect={(id) => {
                    setSelected(id);
                    setInspectorTab("map");
                    setView("overview");
                  }}
                />
              )}
              {view === "overview" && (
                <>
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
                    <AverageReading average={houseAverage} house />
                  </div>
                  {(snap.warnings.telemetry ||
                    snap.warnings.contacts ||
                    snap.warnings.inventory ||
                    snap.warnings.cameras ||
                    snap.warnings.smoke ||
                    snap.warnings.flood) && (
                    <p className="note" role="status">
                      {t("Inventory may be incomplete")}
                    </p>
                  )}
                  <div
                    className={`sensor-layout matrix-dashboard ${detail ? "with-detail" : ""}`}
                  >
                    <SensorMatrix
                      snap={snap}
                      devices={filtered}
                      prefs={prefs}
                      now={now}
                      selected={selected}
                      onSelect={(id) => {
                        setSelected(id);
                        setInspectorTab(
                          snap.devices.some((d) => d.id === id && isCamera(d))
                            ? "map"
                            : "details",
                        );
                        revealInspector();
                      }}
                      activeFloor={
                        floorFocus
                          ? location(floorFocus, prefs).floor
                          : undefined
                      }
                      onSelectFloor={(device) => {
                        setSelected(undefined);
                        setRoomFocus(undefined);
                        setFloorFocus(device);
                        setInspectorTab("map");
                        revealInspector();
                      }}
                      onSelectRoom={(device) => {
                        setFloorFocus(undefined);
                        setSelected(undefined);
                        setRoomFocus(device);
                        setInspectorTab("map");
                        revealInspector();
                      }}
                    />
                    <div ref={inspectorRef} className="sensor-context">
                      <div
                        className="inspector-tabs"
                        role="tablist"
                        aria-label={t("Explore your home")}
                        onKeyDown={(e) => {
                          const tabs = inspectorTabs.map(([tab]) => tab);
                          const index = tabs.indexOf(inspectorTab);
                          const next =
                            e.key === "ArrowRight"
                              ? (index + 1) % tabs.length
                              : e.key === "ArrowLeft"
                                ? (index + tabs.length - 1) % tabs.length
                                : e.key === "Home"
                                  ? 0
                                  : e.key === "End"
                                    ? tabs.length - 1
                                    : -1;
                          if (next >= 0) {
                            e.preventDefault();
                            setInspectorTab(tabs[next]);
                            e.currentTarget
                              .querySelectorAll<HTMLButtonElement>(
                                '[role="tab"]',
                              )
                              [next].focus();
                          }
                        }}
                      >
                        {inspectorTabs.map(([tab, icon, label]) => (
                          <button
                            key={tab}
                            id={`inspector-tab-${tab}`}
                            role="tab"
                            aria-selected={inspectorTab === tab}
                            aria-controls={`inspector-panel-${tab}`}
                            tabIndex={inspectorTab === tab ? 0 : -1}
                            onClick={() => setInspectorTab(tab)}
                          >
                            <Icon name={icon} size={15} />
                            {t(label)}
                          </button>
                        ))}
                      </div>
                      <div
                        id="inspector-panel-details"
                        role="tabpanel"
                        aria-labelledby="inspector-tab-details"
                        hidden={inspectorTab !== "details"}
                      >
                        <div className="sensor-inspector">
                          {!detail && (
                            <section className="sensor-context-empty">
                              <Icon name="grid" size={24} />
                              <h3>
                                {roomFocus
                                  ? location(roomFocus, prefs).room
                                  : t("Select a sensor")}
                              </h3>
                              <p>
                                {roomFocus
                                  ? `${location(roomFocus, prefs).floor} · ${t("Choose a sensor in this room to inspect its readings.")}`
                                  : t(
                                      "Choose a square to inspect its status, temperature and recent activity.",
                                    )}
                              </p>
                            </section>
                          )}
                          {detail && (
                            <aside
                              className="detail-panel"
                              aria-label={t("Sensor details")}
                            >
                              <div className="detail-icon">
                                <Icon
                                  name={deviceIcon(detail.type)}
                                  size={28}
                                />
                              </div>
                              <div className="sensor-detail-title">
                                <h2>{displayDevice(detail, prefs)}</h2>
                                <button
                                  className="icon-button"
                                  onClick={() => setSelected(undefined)}
                                  aria-label={t("Close sensor details")}
                                >
                                  <Icon name="close" size={17} />
                                </button>
                              </div>
                              <p>
                                {location(detail, prefs).floor} /{" "}
                                {location(detail, prefs).room}
                              </p>
                              <div className="sensor-focus-stats">
                                <div>
                                  <span>{t("Temperature")}</span>
                                  <strong>
                                    {detail.temperature === undefined
                                      ? "—"
                                      : `${temperatureText(detail.temperature)}C`}
                                  </strong>
                                  <small>
                                    {detail.temperature === undefined
                                      ? t("Not reported")
                                      : temperatureIsStale(detail, snap, now)
                                        ? t("Last known")
                                        : t("Latest reading")}
                                  </small>
                                </div>
                                <div>
                                  <span>{t("Activity")}</span>
                                  <strong>{t(deviceState(detail))}</strong>
                                  <small>{t(deviceHealth(detail))}</small>
                                </div>
                              </div>
                              {selectedCamera && (
                                <CameraInspector
                                  library={cameraLibrary}
                                  preview
                                  onHistory={() => setInspectorTab("photos")}
                                  onControls={openCameraControls}
                                />
                              )}
                              <details className="sensor-information">
                                <summary>{t("Sensor information")}</summary>
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
                                    [
                                      t("Device health"),
                                      t(deviceHealth(detail)),
                                    ],
                                    [
                                      t("Battery"),
                                      detail.batteryLow === undefined
                                        ? t("Not reported")
                                        : detail.batteryLow
                                          ? t("Low")
                                          : t("No low-battery flag"),
                                    ],
                                    [t("Tamper"), t("Not supplied by API")],
                                    [
                                      t("Last change"),
                                      madrid(detail.changedAt, true),
                                    ],
                                    [
                                      t("Data fetched"),
                                      madrid(detail.fetchedAt, true),
                                    ],
                                    [
                                      t("Last sensor report"),
                                      t("Not supplied by API"),
                                    ],
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
                              </details>
                              <details className="local-edit">
                                <summary>{t("Local names & groups")}</summary>
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
                                        prefs.aliases[detail.id]?.[
                                          key as "name"
                                        ] || ""
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
                              </details>
                            </aside>
                          )}
                        </div>
                      </div>
                      <>
                        <div
                          id="inspector-panel-map"
                          role="tabpanel"
                          aria-labelledby="inspector-tab-map"
                          hidden={inspectorTab !== "map"}
                        >
                          <SensorLocation
                            snap={snap}
                            prefs={prefs}
                            selected={detail}
                            focusRoom={roomFocus}
                            focusFloor={floorFocus}
                            onSelect={setSelected}
                          />
                        </div>
                        {selectedCamera && (
                          <div
                            id="inspector-panel-photos"
                            role="tabpanel"
                            aria-labelledby="inspector-tab-photos"
                            hidden={inspectorTab !== "photos"}
                          >
                            <CameraInspector
                              library={cameraLibrary}
                              onHistory={() => setInspectorTab("photos")}
                              onControls={openCameraControls}
                            />
                          </div>
                        )}
                        <div
                          id="inspector-panel-activity"
                          role="tabpanel"
                          aria-labelledby="inspector-tab-activity"
                          hidden={inspectorTab !== "activity"}
                        >
                          <ActivityDay
                            snap={snap}
                            prefs={prefs}
                            sensor={detail}
                            selected={activityDate}
                            sensorOnly={activitySensorOnly}
                            onScopeChange={setActivitySensorOnly}
                            onSelectSensor={(id) => {
                              setSelected(id);
                              setInspectorTab("details");
                            }}
                          />
                        </div>
                      </>
                    </div>
                  </div>
                  <ActivityCalendar
                    snap={snap}
                    now={now}
                    sensor={detail}
                    selected={activityDate}
                    onSelectDate={showDay}
                    sensorOnly={activitySensorOnly}
                    onHistory={() => setView("activity")}
                  />
                  <div className="sensor-footnote">
                    <span>
                      {t("Contacts fetched")} {madrid(snap.contactsAt)} · Madrid
                    </span>
                  </div>
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
                  <p>{t("Latest 80 records")} · Europe/Madrid</p>
                  <div className="timeline">
                    {visibleEvents.map((e) => (
                      <article key={e.id}>
                        <ActivityActionIcon event={e} />
                        <div className="activity-event-content">
                          <div className="activity-event-heading">
                            <h3>{eventDescription(e)}</h3>
                            <time dateTime={e.time}>{eventTime(e)}</time>
                          </div>
                          <ActivityActor event={e} people={snap.keyTagPeople} />
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
                            homeName +
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
                          {panels.length > 1 && (
                            <label>
                              {t("Connected house")}
                              <select
                                aria-label={t("Connected house")}
                                value={snap.panelId}
                                disabled={pending || busy}
                                onChange={(e) =>
                                  void perform(() =>
                                    selectProperty(e.target.value),
                                  )
                                }
                              >
                                {panels.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {prefs.homeNames?.[p.id] || p.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label>
                            {t("House display name")}
                            <input
                              value={prefs.homeNames?.[snap.panelId] || ""}
                              placeholder={snap.name}
                              maxLength={500}
                              onChange={(e) =>
                                save({
                                  ...prefs,
                                  homeNames: {
                                    ...prefs.homeNames,
                                    [snap.panelId]: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <p className="note">
                            {t(
                              "This name is saved only on this computer. It does not rename your Sector Alarm account.",
                            )}
                          </p>
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
                          aria-label={t("Sensor density")}
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
                    <TemperatureSettings prefs={prefs} onSave={save} />
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
              : t("This will change the alarm at {0}.", homeName)}
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
                      await selectProperty(p.id);
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
