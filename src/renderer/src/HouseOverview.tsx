import { useEffect, useRef, useState } from "react";
import {
  bestGrid,
  floorPlans,
  isExteriorPlan,
  type HouseMapData,
  type MapPlacement,
} from "../../shared/house-map";
import type { Device, Preferences } from "../../shared/model";
import { PlanDrawing } from "./PlanDrawing";
import { HouseModel3D } from "./HouseModel3D";
import { sensorCount, useLanguage } from "./i18n";

/** Interior plans, excluding the stand-alone exterior study. */
export const interiorPlans = (data: HouseMapData) =>
  data.plans.filter((p) => !isExteriorPlan(p));
export const exteriorPlan = (data: HouseMapData) =>
  data.plans.find((p) => p.drawing && isExteriorPlan(p));

/**
 * The whole house at a glance: every floor plan as a card that opens it, or
 * the exterior model in 3D. Cards carry the sensor list's floor names, order
 * and counts; sensor pins stay on the individual plans.
 */
export function HouseOverview({
  name,
  data,
  places,
  devices = [],
  prefs,
  threeD,
  online,
  armed,
  onOpen,
}: {
  name: string;
  data: HouseMapData;
  places: Record<string, MapPlacement | null | undefined>;
  devices?: Device[];
  prefs: Preferences;
  threeD: boolean;
  online?: boolean;
  armed?: boolean;
  onOpen: (planId: string) => void;
}) {
  const { t } = useLanguage();
  const exterior = exteriorPlan(data);
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number }>();
  const showModel = threeD && !!exterior;
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () =>
      // Only a panel of fixed height can be filled; where the page scrolls
      // instead (narrow screens) the cards keep their natural size.
      setBox(
        getComputedStyle(grid.parentElement!).display === "flex"
          ? { width: grid.clientWidth, height: grid.clientHeight }
          : undefined,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [showModel]);
  if (showModel)
    return (
      <div className="location-model house-overview-model">
        <HouseModel3D
          key={exterior.id}
          plan={exterior}
          devices={[]}
          places={{}}
          prefs={prefs}
          online={online}
          compact
          onSelect={() => {}}
        />
      </div>
    );
  const cards = floorPlans(data, devices, places, prefs);
  // Use the whole panel: the arrangement that draws the plans largest.
  const grid =
    box &&
    bestGrid(
      cards.map(({ plan }) =>
        plan.drawing
          ? [plan.drawing.bounds[2], plan.drawing.bounds[3]]
          : [plan.width, plan.height],
      ),
      box,
    );
  return (
    <div
      ref={gridRef}
      className={`house-overview ${grid ? "is-fitted" : ""}`}
      style={
        grid && {
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }
      }
      role="group"
      aria-label={t("Floor plans of {0}", name)}
    >
      {cards.map((entry) => {
        const { plan, title } = entry;
        // Counted like the sensor list: every sensor of the plan's floors.
        const count = entry.devices.length;
        const open = entry.devices.filter(
          (d) => d.closed === false && !d.offline && !d.plugState,
        ).length;
        return (
          <button
            key={plan.id}
            className="house-plan-card"
            data-plan-id={plan.id}
            aria-label={t("Open floor plan {0}", title)}
            onClick={() => onOpen(plan.id)}
          >
            <span className="house-plan-thumb" aria-hidden="true">
              {plan.drawing ? (
                <PlanDrawing plan={plan} openings={false} />
              ) : (
                <span className="house-plan-blank" />
              )}
            </span>
            <strong>{title}</strong>
            <small>
              {sensorCount(count, t)}
              {open > 0 && (
                <span className={`house-plan-open ${armed ? "is-alert" : ""}`}>
                  {" · "}
                  {open} {t("open")}
                </span>
              )}
            </small>
          </button>
        );
      })}
    </div>
  );
}
