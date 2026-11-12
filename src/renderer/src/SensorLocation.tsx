import { Tooltip } from "./Tooltip";
import { temperatureIsStale, temperatureText } from "../../shared/climate";
import {
  temperatureRange,
  temperatureGradient,
  temperatureColor,
} from "../../shared/temperature-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  floorPlans,
  suggestPlacements,
  type HouseMapData,
  type MapPlacement,
  type MapPlan,
  type PlanPoint,
} from "../../shared/house-map";
import { isCamera } from "../../shared/cameras";
import {
  deviceIsStale,
  deviceState,
  deviceTone,
  displayDevice,
  location,
  placedDevice,
  reportsNoRoom,
  type Device,
  type Preferences,
  type Snapshot,
} from "../../shared/model";
import { bridge } from "./bridge";
import { PlanDrawing } from "./PlanDrawing";
import { HouseModel3D } from "./HouseModel3D";
import { HouseOverview, exteriorPlan, interiorPlans } from "./HouseOverview";
import { Icon, deviceIcon } from "./icons";
import { useLanguage } from "./i18n";

const clamp = (value: number) => Math.max(0.01, Math.min(0.99, value));

function inside([x, y]: PlanPoint, points: PlanPoint[]) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}

/** The plan room under a point, so heat maps and highlights follow a move. */
function roomAt(plan: MapPlan, data: HouseMapData, x: number, y: number) {
  const point: PlanPoint = [x * plan.width, y * plan.height];
  return plan.drawing?.areas.find(
    (a) =>
      data.rooms.some((r) => r.id === a.id && r.planId === plan.id) &&
      inside(point, a.points),
  )?.id;
}

export function SensorLocation({
  snap,
  prefs,
  selected,
  focusRoom,
  focusFloor,
  onSelect,
  onAssign,
  houseName,
  now,
}: {
  /** With nothing selected, the panel opens on the whole house under this name. */
  houseName?: string;
  now: number;
  snap: Snapshot;
  prefs: Preferences;
  selected?: Device;
  focusRoom?: Device;
  focusFloor?: Device;
  onSelect: (id: string) => void;
  /** Gives a device that reports no room the inventory room it was placed in. */
  onAssign?: (id: string, source: Device) => void;
}) {
  const { t } = useLanguage();
  const [heat, setHeat] = useState(false);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ id: string; p: MapPlacement }>();
  const [planOverride, setPlanOverride] = useState<string>();
  const [data, setData] = useState<HouseMapData>();
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [reload, setReload] = useState(0);
  const [room, setRoom] = useState<string>();
  const [image, setImage] = useState("");
  useEffect(() => {
    let alive = true;
    setData(undefined);
    setError("");
    bridge
      .houseMap()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [snap.panelId, snap.demo, reload]);
  // Locally assigned rooms count, so an assigned smart plug is suggested there.
  const placedDevices = useMemo(
    () => snap.devices.map((d) => placedDevice(d, prefs)),
    [snap.devices, prefs],
  );
  const suggested = useMemo(
    () => (data ? suggestPlacements(placedDevices, data) : {}),
    [data, placedDevices],
  );
  const places: Record<string, MapPlacement | null | undefined> = {
    ...suggested,
    ...data?.placements,
  };
  if (draft) places[draft.id] = draft.p;
  const roomPlacement = useMemo(
    () =>
      data && focusRoom
        ? suggestPlacements([placedDevice(focusRoom, prefs)], data)[
            focusRoom.id
          ]
        : undefined,
    [data, focusRoom, prefs],
  );
  const placement = selected ? places[selected.id] : roomPlacement;
  useEffect(() => {
    setRoom(undefined);
    setPlanOverride(undefined);
  }, [selected?.id, focusRoom?.id, focusFloor?.id, snap.panelId]);
  // Plans named and matched to floors exactly like the sensor list, so a plan
  // file's own label never contradicts the list's floor names.
  const sections = useMemo(
    () =>
      data
        ? floorPlans(
            data,
            snap.devices,
            { ...suggested, ...data.placements },
            prefs,
          )
        : [],
    [data, snap.devices, suggested, prefs],
  );
  const plans = useMemo(
    () =>
      data?.plans.map((p) => ({
        ...p,
        label: sections.find((s) => s.plan.id === p.id)?.title || p.label,
      })),
    [data, sections],
  );
  const focusedFloor = focusFloor && location(focusFloor, prefs).floor;
  const plan =
    (planOverride && plans?.find((p) => p.id === planOverride)) ||
    (focusFloor
      ? plans?.find(
          (p) =>
            p.id ===
            (sections.find((s) => s.floors.includes(focusedFloor!))?.plan.id ||
              focusFloor.floorId),
        )
      : plans?.find((p) => p.id === placement?.planId) || plans?.[0]);
  const roomId =
    room ?? (placement?.planId === plan?.id ? placement?.roomId : undefined);
  useEffect(() => {
    let alive = true;
    setImage("");
    if (plan && !plan.drawing)
      bridge
        .mapImage(plan.id)
        .then((value) => {
          if (alive) setImage(value);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [plan?.id, plan?.drawing, reload]);
  // Nothing selected: every floor plan at a glance, or the exterior in 3D.
  const unfocused = !selected && !focusRoom && !focusFloor && !editing;
  const house =
    !!houseName &&
    unfocused &&
    !planOverride &&
    !!data &&
    interiorPlans(data).length > 1;
  const houseThreeD = house && view === "3d" && !!exteriorPlan(data!);
  // The 3D model needs a traced drawing; editing happens on the 2D plan.
  const threeD = !house && view === "3d" && !!plan?.drawing;
  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setEditing(false);
    };
    // Capture phase: leaving edit mode must not also clear the selection.
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [editing]);
  const bounds = plan?.drawing?.bounds || [
    0,
    0,
    plan?.width || 1,
    plan?.height || 1,
  ];
  const stageRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    p: MapPlacement;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [!!plan, threeD, house]);
  const fit = (b: number[]) =>
    Math.min(stageSize.width / b[2], stageSize.height / b[3]);
  // Interior plans share one drawing scale, so labels and walls read the same
  // size on every floor; a small floor may grow a little, never to fill.
  const sharedFit =
    data && plan?.drawing && plan.model?.scene !== "exterior"
      ? Math.min(
          ...interiorPlans(data)
            .filter((p) => p.drawing)
            .map((p) => fit(p.drawing!.bounds)),
        ) * 1.3
      : Infinity;
  const planWidth = bounds[2] * Math.min(fit(bounds), sharedFit);
  const scale = temperatureRange(prefs.temperatureRange);
  const readings = snap.devices.filter(
    (d) =>
      places[d.id]?.planId === plan?.id &&
      Number.isFinite(d.temperature) &&
      !d.stale &&
      snap.online === true &&
      !temperatureIsStale(d, snap, now),
  );
  const grouped = new Map<string, number[]>();
  for (const d of readings) {
    const roomId = places[d.id]?.roomId;
    if (roomId)
      grouped.set(roomId, [...(grouped.get(roomId) || []), d.temperature!]);
  }
  const roomTemperatures = new Map(
    [...grouped].map(([id, values]) => [
      id,
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ]),
  );

  async function save(id: string, p: MapPlacement | null) {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await bridge.saveMapPlacement(id, p);
      // Placing a device without a reported room assigns that room too.
      const device = snap.devices.find((d) => d.id === id);
      const alias = prefs.aliases[id];
      if (
        p?.roomId &&
        device &&
        reportsNoRoom(device) &&
        !alias?.placeRoomId &&
        !alias?.room
      ) {
        const source = snap.devices.find(
          (d) => !reportsNoRoom(d) && suggested[d.id]?.roomId === p.roomId,
        );
        if (source) onAssign?.(id, source);
      }
      setData((old) =>
        old
          ? {
              ...old,
              placements: {
                ...old.placements,
                [id]: p
                  ? {
                      ...p,
                      confirmed: true,
                      reason: t("Location confirmed or edited locally."),
                    }
                  : null,
              },
            }
          : old,
      );
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
      setDraft(undefined);
    }
  }
  /** Converts a pointer position over the plan into a stored placement. */
  function pointAt(id: string, clientX: number, clientY: number): MapPlacement {
    const rect = planRef.current!.getBoundingClientRect();
    const x = clamp(
      (bounds[0] + ((clientX - rect.left) / rect.width) * bounds[2]) /
        plan!.width,
    );
    const y = clamp(
      (bounds[1] + ((clientY - rect.top) / rect.height) * bounds[3]) /
        plan!.height,
    );
    const heading = places[id]?.heading;
    return {
      planId: plan!.id,
      roomId: data ? roomAt(plan!, data, x, y) : undefined,
      x,
      y,
      ...(heading !== undefined ? { heading } : {}),
      confirmed: true,
      reason: t("Position edited locally."),
    };
  }
  function nudge(d: Device, p: MapPlacement, key: string, large: boolean) {
    const step = large ? 0.02 : 0.005;
    const x = clamp(
      p.x + (key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0),
    );
    const y = clamp(
      p.y + (key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0),
    );
    void save(d.id, {
      ...p,
      x,
      y,
      roomId: data ? roomAt(plan!, data, x, y) : p.roomId,
    });
  }

  const selectedName = selected ? displayDevice(selected, prefs) : "";
  const selectedPlacement = selected ? places[selected.id] : undefined;
  const hint =
    selected && data?.cameraHints?.find((h) => h.deviceId === selected.id);
  const onThisPlan = selectedPlacement?.planId === plan?.id;
  const cameras = snap.devices.filter(
    (d) =>
      isCamera(d) &&
      places[d.id]?.planId === plan?.id &&
      places[d.id]?.heading !== undefined,
  );

  return (
    <section
      className={`sensor-location ${editing ? "is-editing" : ""} ${threeD ? "is-3d" : ""} ${house ? "is-house" : ""}`}
      aria-label={t("Sensor location")}
    >
      {error && (
        <div role="alert" className="warning-text">
          <p>{t("Could not load the floor plan. Try again.")}</p>
          <button onClick={() => setReload((value) => value + 1)}>
            {t("Retry")}
          </button>
        </div>
      )}
      {!data && !error && <p className="note">{t("Loading local plans…")}</p>}
      {data && !plan && (
        <p className="note">
          {t(
            focusFloor
              ? "No floor plan is available for this floor."
              : "No local floor plans have been imported on this Mac.",
          )}
        </p>
      )}
      {plan && data && (
        <>
          <div className="location-edit-toolbar">
            {heat && !threeD && (
              <Tooltip
                label={`${t(plan.drawing ? "Room averages · fresh readings only" : "Sensor readings · fresh readings only")} · ${readings.length} ${t("sensors")}. ${t(readings.length ? "Gray areas have no fresh readings." : "No fresh temperature readings on this floor.")}`}
              >
                <button
                  className="temperature-map-legend"
                  aria-label={t("Temperature scale")}
                >
                  <span>{scale.min}°C</span>
                  <i style={{ background: temperatureGradient }} />
                  <span>{scale.max}°C</span>
                  <Icon name="info" size={12} />
                </button>
              </Tooltip>
            )}
            {house && (
              <strong className="house-overview-title">{houseName}</strong>
            )}
            {!!houseName && unfocused && !!planOverride && (
              <button
                className="house-overview-back"
                onClick={() => setPlanOverride(undefined)}
              >
                <Icon name="layers" size={14} />
                {t("All floors")}
              </button>
            )}
            {(house ? !!exteriorPlan(data) : plan.drawing) && (
              <div
                className="location-view-switch"
                role="group"
                aria-label={t("Plan view")}
              >
                <button
                  aria-pressed={!threeD && !houseThreeD}
                  aria-label={t("2D plan")}
                  title={t("2D plan")}
                  onClick={() => setView("2d")}
                >
                  2D
                </button>
                <button
                  aria-pressed={threeD || houseThreeD}
                  aria-label={t("3D model")}
                  title={t("3D model")}
                  onClick={() => {
                    setView("3d");
                    setEditing(false);
                  }}
                >
                  3D
                </button>
              </div>
            )}
            {!threeD && !house && (
              <>
                <Tooltip label={t("Temperature layer")}>
                  <button
                    aria-label={t("Temperature layer")}
                    aria-pressed={heat}
                    onClick={() => setHeat(!heat)}
                  >
                    <Icon name="temperature" size={16} />
                  </button>
                </Tooltip>
                <Tooltip label={t("Edit sensor locations")}>
                  <button
                    aria-label={t("Edit sensor locations")}
                    aria-pressed={editing}
                    onClick={() => setEditing(!editing)}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
          {editing && !threeD && (
            <div
              className="location-editor"
              role="region"
              aria-label={t("Edit sensor locations")}
            >
              <div className="location-editor-heading">
                <strong>{t("Editing positions")}</strong>
                {data.plans.length > 1 && (
                  <select
                    aria-label={t("Floor plan")}
                    value={plan.id}
                    disabled={saving}
                    onChange={(e) => setPlanOverride(e.target.value)}
                  >
                    {plans!.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}
                <button className="primary" onClick={() => setEditing(false)}>
                  {t("Finish editing")}
                </button>
              </div>
              <p className="location-editor-hint">
                {!selected
                  ? t(
                      "Select a sensor on the plan or in the table, then drag its marker or click where it is mounted.",
                    )
                  : !selectedPlacement
                    ? t(
                        "{0} is not on the map yet. Click the plan where it is mounted.",
                        selectedName,
                      )
                    : !onThisPlan
                      ? t(
                          "{0} is on another floor. Click this plan to move it here.",
                          selectedName,
                        )
                      : t(
                          "Drag {0} or click the plan to move it. Arrow keys nudge a focused marker; Shift moves further.",
                          selectedName,
                        )}
              </p>
              {selected && (
                <div className="location-editor-actions">
                  <span
                    className={`location-status ${selectedPlacement ? (selectedPlacement.confirmed ? "confirmed" : "suggested") : "unplaced"}`}
                  >
                    {selectedPlacement
                      ? selectedPlacement.confirmed
                        ? t("Confirmed")
                        : t("Suggested")
                      : t("Unplaced")}
                  </span>
                  {selectedPlacement && !selectedPlacement.confirmed && (
                    <button
                      disabled={saving}
                      onClick={() => void save(selected.id, selectedPlacement)}
                    >
                      <Icon name="check" size={14} />
                      {t("Confirm this location")}
                    </button>
                  )}
                  {hint && suggested[selected.id] && (
                    <button
                      disabled={saving}
                      onClick={() =>
                        void save(selected.id, suggested[selected.id])
                      }
                    >
                      {t("Use photo-based position")}
                    </button>
                  )}
                  {plan.drawing && (
                    <select
                      aria-label={t("Place at identified opening")}
                      value=""
                      disabled={saving}
                      onChange={(e) => {
                        const opening = plan.drawing!.openings.find(
                          (o) => o.id === e.target.value,
                        );
                        if (!opening) return;
                        const heading = selectedPlacement?.heading;
                        void save(selected.id, {
                          planId: plan.id,
                          roomId: data.rooms.some(
                            (r) =>
                              r.id === opening.roomId && r.planId === plan.id,
                          )
                            ? opening.roomId
                            : undefined,
                          x: (opening.a[0] + opening.b[0]) / 2 / plan.width,
                          y: (opening.a[1] + opening.b[1]) / 2 / plan.height,
                          ...(heading !== undefined ? { heading } : {}),
                          confirmed: true,
                          reason: t("Opening selected locally."),
                        });
                      }}
                    >
                      <option value="">{t("Choose a door or window")}</option>
                      {plan.drawing.openings.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id} ·{" "}
                          {data.rooms.find((r) => r.id === o.roomId)?.label ||
                            o.roomId}{" "}
                          · {t(o.kind === "door" ? "Door" : "Window")}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedPlacement && (
                    <button
                      disabled={saving}
                      onClick={() => void save(selected.id, null)}
                    >
                      {t("Remove from map")}
                    </button>
                  )}
                  {isCamera(selected) && selectedPlacement && (
                    <label className="location-direction">
                      <span>
                        {t("Camera direction")}{" "}
                        <output>
                          {Math.round(selectedPlacement.heading || 0)}°
                        </output>
                      </span>
                      <input
                        aria-label={t("Camera direction")}
                        type="range"
                        min="0"
                        max="359"
                        step="1"
                        value={selectedPlacement.heading || 0}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft({
                            id: selected.id,
                            p: {
                              ...selectedPlacement,
                              heading: Number(e.target.value),
                            },
                          })
                        }
                        onPointerUp={() => {
                          if (draft) void save(selected.id, draft.p);
                        }}
                        onKeyUp={() => {
                          if (draft) void save(selected.id, draft.p);
                        }}
                        onBlur={() => {
                          if (draft) void save(selected.id, draft.p);
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
              {saving && (
                <p role="status" className="note">
                  {t("Saving location…")}
                </p>
              )}
              {saveError && (
                <p role="alert" className="warning-text">
                  {saveError}
                </p>
              )}
            </div>
          )}
          {house ? (
            <HouseOverview
              name={houseName!}
              data={data}
              places={places}
              devices={snap.devices}
              prefs={prefs}
              threeD={houseThreeD}
              online={snap.online}
              armed={snap.mode === "armed"}
              onOpen={setPlanOverride}
            />
          ) : threeD ? (
            <div className="location-model">
              <HouseModel3D
                key={plan.id}
                plan={plan}
                devices={snap.devices}
                places={
                  Object.fromEntries(
                    Object.entries(places).filter(([, p]) => p),
                  ) as Record<string, MapPlacement>
                }
                prefs={prefs}
                online={snap.online}
                armed={snap.mode === "armed"}
                compact
                roomId={roomId}
                onSelect={(d) => onSelect(d.id)}
              />
            </div>
          ) : (
            <div className="location-stage" ref={stageRef}>
              <div
                ref={planRef}
                className={`location-plan ${heat ? "heat-layer" : ""}`}
                data-plan-id={plan.id}
                aria-label={plan.label}
                style={{
                  aspectRatio: `${bounds[2]} / ${bounds[3]}`,
                  width: planWidth,
                }}
                onPointerDown={(e) => {
                  if (
                    editing &&
                    selected &&
                    !saving &&
                    !(e.target as HTMLElement).closest(".location-pin")
                  )
                    void save(
                      selected.id,
                      pointAt(selected.id, e.clientX, e.clientY),
                    );
                }}
                onPointerMove={(e) => {
                  const move = drag.current;
                  if (
                    move &&
                    (move.moved ||
                      Math.hypot(
                        e.clientX - move.startX,
                        e.clientY - move.startY,
                      ) > 3)
                  ) {
                    move.moved = true;
                    move.p = pointAt(move.id, e.clientX, e.clientY);
                    setDraft({ id: move.id, p: move.p });
                  }
                }}
                onPointerUp={() => {
                  const move = drag.current;
                  drag.current = null;
                  if (move?.moved) void save(move.id, move.p);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDraft(undefined);
                }}
              >
                {plan.drawing ? (
                  <PlanDrawing
                    plan={plan}
                    openings={editing}
                    temperatures={heat ? roomTemperatures : undefined}
                    temperatureScale={scale}
                  />
                ) : image ? (
                  <img src={image} alt={plan.label} draggable={false} />
                ) : (
                  <p>{t("Loading plan…")}</p>
                )}
                {heat && !plan.drawing && (
                  <svg
                    className="temperature-point-layer"
                    viewBox={`0 0 ${plan.width} ${plan.height}`}
                    aria-label={t("Temperature layer")}
                  >
                    {readings.map((d) => {
                      const p = places[d.id]!;
                      return (
                        <g key={d.id}>
                          <circle
                            cx={p.x * plan.width}
                            cy={p.y * plan.height}
                            r={Math.min(plan.width, plan.height) * 0.07}
                            fill={temperatureColor(d.temperature, scale)}
                            fillOpacity={0.45}
                          />
                          <text
                            x={p.x * plan.width}
                            y={
                              p.y * plan.height +
                              Math.min(plan.width, plan.height) * 0.045
                            }
                            textAnchor="middle"
                            fontSize={Math.min(plan.width, plan.height) * 0.025}
                          >
                            {temperatureText(d.temperature)}C
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}
                {plan.drawing && (
                  <svg className="location-rooms" viewBox={bounds.join(" ")}>
                    {plan.drawing.areas
                      .filter((a) => data.rooms.some((r) => r.id === a.id))
                      .map((area) => (
                        <polygon
                          key={area.id}
                          points={area.points.map((p) => p.join(",")).join(" ")}
                          className={area.id === roomId ? "is-selected" : ""}
                          role={editing ? undefined : "button"}
                          tabIndex={editing ? -1 : 0}
                          aria-label={t("Show room {0}", area.label)}
                          aria-pressed={
                            editing ? undefined : area.id === roomId
                          }
                          onClick={() => {
                            if (!editing) setRoom(area.id);
                          }}
                          onKeyDown={(e) => {
                            if (
                              !editing &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              setRoom(area.id);
                            }
                          }}
                        />
                      ))}
                  </svg>
                )}
                {!!cameras.length && (
                  <svg
                    className="location-camera-directions"
                    viewBox={bounds.join(" ")}
                    aria-hidden="true"
                  >
                    {cameras.map((d) => {
                      const p = places[d.id]!;
                      return (
                        <g
                          key={d.id}
                          transform={`translate(${p.x * plan.width} ${p.y * plan.height}) rotate(${p.heading})`}
                        >
                          <path
                            d="M0,0 L90,-38 A98,98 0 0 1 90,38 Z"
                            className={`camera-direction ${selected?.id === d.id ? "selected" : ""}`}
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}
                {snap.devices
                  .filter((d) => places[d.id]?.planId === plan.id)
                  .map((d) => {
                    const p = places[d.id]!;
                    const x =
                      ((p.x * plan.width - bounds[0]) / bounds[2]) * 100;
                    const y =
                      ((p.y * plan.height - bounds[1]) / bounds[3]) * 100;
                    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
                    const tone = deviceTone(d, {
                      stale: deviceIsStale(d, snap.online, now),
                      armed: snap.mode === "armed",
                    });
                    return (
                      <button
                        key={d.id}
                        className={`location-pin ${tone} ${p.confirmed ? "confirmed" : "suggested"} ${selected?.id === d.id ? "is-selected" : ""}`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoom(undefined);
                          onSelect(d.id);
                        }}
                        onPointerDown={(e) => {
                          if (!editing || saving) return;
                          e.stopPropagation();
                          onSelect(d.id);
                          drag.current = {
                            id: d.id,
                            p,
                            startX: e.clientX,
                            startY: e.clientY,
                            moved: false,
                          };
                          planRef.current?.setPointerCapture(e.pointerId);
                        }}
                        onKeyDown={(e) => {
                          if (
                            editing &&
                            !saving &&
                            [
                              "ArrowLeft",
                              "ArrowRight",
                              "ArrowUp",
                              "ArrowDown",
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            nudge(d, p, e.key, e.shiftKey);
                          }
                        }}
                        aria-label={`${t("Locate {0}", displayDevice(d, prefs))}${tone === "open" || tone === "open-armed" || tone === "alarm" ? ` · ${t(deviceState(d))}` : ""}`}
                        aria-pressed={selected?.id === d.id}
                        title={`${displayDevice(d, prefs)} · ${t(deviceState(d))} · ${p.confirmed ? t("Confirmed") : t("Suggested")}`}
                      >
                        <Icon name={deviceIcon(d.type)} size={12} />
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
