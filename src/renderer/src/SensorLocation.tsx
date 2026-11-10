import { Tooltip } from "./Tooltip";
import { temperatureIsStale, temperatureText } from "../../shared/climate";
import {
  temperatureRange,
  temperatureGradient,
  temperatureColor,
} from "../../shared/temperature-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import { suggestPlacements, type HouseMapData } from "../../shared/house-map";
import {
  displayDevice,
  location,
  type Device,
  type Preferences,
  type Snapshot,
} from "../../shared/model";
import { bridge } from "./bridge";
import { PlanDrawing } from "./PlanDrawing";
import { Icon, deviceIcon } from "./icons";
import { useLanguage } from "./i18n";

export function SensorLocation({
  snap,
  prefs,
  selected,
  focusRoom,
  focusFloor,
  onSelect,
  onEdit,
  now,
}: {
  now: number;
  snap: Snapshot;
  prefs: Preferences;
  selected?: Device;
  focusRoom?: Device;
  focusFloor?: Device;
  onSelect: (id: string) => void;
  onEdit: (planId: string) => void;
}) {
  const { t } = useLanguage();
  const [heat, setHeat] = useState(false);
  const [data, setData] = useState<HouseMapData>();
  const [error, setError] = useState("");
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
  const places = useMemo(
    () =>
      data
        ? { ...suggestPlacements(snap.devices, data), ...data.placements }
        : {},
    [data, snap.devices],
  );
  const roomPlacement = useMemo(
    () =>
      data && focusRoom
        ? suggestPlacements([focusRoom], data)[focusRoom.id]
        : undefined,
    [data, focusRoom],
  );
  const placement = selected ? places[selected.id] : roomPlacement;
  useEffect(() => {
    setRoom(undefined);
  }, [selected?.id, focusRoom?.id, focusFloor?.id, snap.panelId]);
  const floorPlacement = focusFloor
    ? snap.devices
        .filter(
          (device) =>
            location(device, prefs).floor === location(focusFloor, prefs).floor,
        )
        .map((device) => places[device.id])
        .find(Boolean)
    : undefined;
  const plan = focusFloor
    ? data?.plans.find(
        (p) => p.id === floorPlacement?.planId || p.id === focusFloor.floorId,
      )
    : data?.plans.find((p) => p.id === placement?.planId) || data?.plans[0];
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
  const bounds = plan?.drawing?.bounds || [
    0,
    0,
    plan?.width || 1,
    plan?.height || 1,
  ];
  const stageRef = useRef<HTMLDivElement>(null);
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
  }, [!!plan]);
  const planWidth = Math.min(
    stageSize.width,
    (stageSize.height * bounds[2]) / bounds[3],
  );
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
  return (
    <section className="sensor-location" aria-label={t("Sensor location")}>
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
      {plan && (
        <>
          <div className="location-edit-toolbar">
            {heat && (
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
                onClick={() => onEdit(plan.id)}
              >
                <Icon name="edit" size={16} />
              </button>
            </Tooltip>
          </div>
          <div className="location-stage" ref={stageRef}>
            <div
              className={`location-plan ${heat ? "heat-layer" : ""}`}
              data-plan-id={plan.id}
              aria-label={plan.label}
              style={{
                aspectRatio: `${bounds[2]} / ${bounds[3]}`,
                width: planWidth,
              }}
            >
              {plan.drawing ? (
                <PlanDrawing
                  plan={plan}
                  openings={false}
                  temperatures={heat ? roomTemperatures : undefined}
                  temperatureScale={scale}
                />
              ) : image ? (
                <img src={image} alt={plan.label} />
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
                    .filter((a) => data?.rooms.some((r) => r.id === a.id))
                    .map((area) => (
                      <polygon
                        key={area.id}
                        points={area.points.map((p) => p.join(",")).join(" ")}
                        className={area.id === roomId ? "is-selected" : ""}
                        role="button"
                        tabIndex={0}
                        aria-label={t("Show room {0}", area.label)}
                        aria-pressed={area.id === roomId}
                        onClick={() => setRoom(area.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRoom(area.id);
                          }
                        }}
                      />
                    ))}
                </svg>
              )}
              {snap.devices
                .filter((d) => places[d.id]?.planId === plan.id)
                .map((d) => {
                  const p = places[d.id]!;
                  const x = ((p.x * plan.width - bounds[0]) / bounds[2]) * 100;
                  const y = ((p.y * plan.height - bounds[1]) / bounds[3]) * 100;
                  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
                  return (
                    <button
                      key={d.id}
                      className={`location-pin ${p.confirmed ? "confirmed" : "suggested"} ${selected?.id === d.id ? "is-selected" : ""}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      onClick={() => {
                        setRoom(undefined);
                        onSelect(d.id);
                      }}
                      aria-label={t("Locate {0}", displayDevice(d, prefs))}
                      aria-pressed={selected?.id === d.id}
                      title={`${displayDevice(d, prefs)} · ${p.confirmed ? t("Confirmed") : t("Suggested")}`}
                    >
                      <Icon name={deviceIcon(d.type)} size={12} />
                    </button>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
