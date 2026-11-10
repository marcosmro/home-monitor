import {
  temperatureColor,
  type TemperatureRange,
} from "../../shared/temperature-scale";
import { temperatureText } from "../../shared/climate";
import type { MapPlan } from "../../shared/house-map";

/** Local vector geometry; never executes markup from an imported catalog. */
export function PlanDrawing({
  plan,
  openings = true,
  temperatures,
  temperatureScale,
}: {
  plan: MapPlan;
  openings?: boolean;
  temperatures?: Map<string, number>;
  temperatureScale?: TemperatureRange;
}) {
  const d = plan.drawing!;
  return (
    <svg
      className={`map-vector ${temperatures ? "temperature-plan" : ""}`}
      viewBox={d.bounds.join(" ")}
      role="img"
      aria-label={`${plan.label}, redrawn floor plan with doors and windows`}
    >
      <rect
        x={d.bounds[0]}
        y={d.bounds[1]}
        width={d.bounds[2]}
        height={d.bounds[3]}
        fill="#fbfcfa"
      />
      {d.areas.map((a) => (
        <g key={a.id}>
          <polygon
            points={a.points.map((p) => p.join(",")).join(" ")}
            className={`plan-area ${a.kind || ""}`}
            style={
              temperatures && temperatureScale
                ? {
                    fill:
                      temperatureColor(
                        temperatures.get(a.id),
                        temperatureScale,
                      ) || "#edf0f2",
                    fillOpacity: temperatures.has(a.id) ? 0.48 : 1,
                  }
                : undefined
            }
          />
        </g>
      ))}
      <g className="plan-detail">
        {d.details.map((p, i) => (
          <path key={i} d={p} />
        ))}
      </g>
      <g className="plan-wall">
        {d.walls.map((p, i) => (
          <path key={i} d={p} />
        ))}
      </g>
      {d.openings.map((o) => (
        <g key={o.id} className={`plan-opening ${o.kind}`}>
          <title>
            {o.id}: {o.kind}
          </title>
          <line
            x1={o.a[0]}
            y1={o.a[1]}
            x2={o.b[0]}
            y2={o.b[1]}
            stroke="#fbfcfa"
            strokeWidth={10}
          />
          {o.kind === "door" ? (
            <path
              d={o.swing || `M${o.a.join(",")} L${o.b.join(",")}`}
              className="plan-door"
            />
          ) : (
            <>
              <line
                x1={o.a[0]}
                y1={o.a[1]}
                x2={o.b[0]}
                y2={o.b[1]}
                className="plan-glass"
              />
              <line
                x1={o.a[0]}
                y1={o.a[1]}
                x2={o.b[0]}
                y2={o.b[1]}
                className="plan-glass-inner"
              />
            </>
          )}
          {openings && (
            <text
              x={(o.a[0] + o.b[0]) / 2 + (o.a[0] === o.b[0] ? 12 : 0)}
              y={(o.a[1] + o.b[1]) / 2 - 10}
              className="plan-opening-label"
            >
              {o.id}
            </text>
          )}
        </g>
      ))}
      {d.areas.map((a) => (
        <text
          key={a.id}
          x={a.labelAt[0]}
          y={a.labelAt[1]}
          className="plan-room-label"
        >
          {a.label.split("|").map((line, i) => (
            <tspan key={i} x={a.labelAt[0]} dy={i ? 19 : 0}>
              {line}
            </tspan>
          ))}
          {temperatures?.has(a.id) && (
            <tspan className="plan-temperature-label" x={a.labelAt[0]} dy="20">
              {temperatureText(temperatures.get(a.id))}C
            </tspan>
          )}
          {!temperatures && a.area && (
            <tspan x={a.labelAt[0]} dy="18" className="plan-area-label">
              {a.area}
            </tspan>
          )}
        </text>
      ))}
    </svg>
  );
}
