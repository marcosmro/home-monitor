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
}: {
  snap: Snapshot;
  prefs: Preferences;
  selected?: Device;
  focusRoom?: Device;
  focusFloor?: Device;
  onSelect: (id: string) => void;
}) {
  const { t } = useLanguage();
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
          <div className="location-stage" ref={stageRef}>
            <div
              className="location-plan"
              data-plan-id={plan.id}
              aria-label={plan.label}
              style={{
                aspectRatio: `${bounds[2]} / ${bounds[3]}`,
                width: planWidth,
              }}
            >
              {plan.drawing ? (
                <PlanDrawing plan={plan} openings={false} />
              ) : image ? (
                <img src={image} alt={plan.label} />
              ) : (
                <p>{t("Loading plan…")}</p>
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
