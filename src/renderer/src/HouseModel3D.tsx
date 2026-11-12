import { useLanguage } from "./i18n";
import { rasterizeHouse } from "./house-raster";
import { useMemo, useRef, useState } from "react";
import {
  buildHouseMesh,
  floorLevel,
  meshToObj,
  triangulate,
  type Vec3,
} from "../../shared/house-mesh";
import type { MapPlan, MapPlacement } from "../../shared/house-map";
import {
  deviceState,
  deviceHealth,
  displayDevice,
  deviceIsStale,
  deviceTone,
  type Device,
  type Preferences,
} from "../../shared/model";

export function HouseModel3D({
  plan,
  devices,
  places,
  prefs,
  onSelect,
  online,
  armed,
  compact = false,
  roomId,
}: {
  /** Selected room: its floor is tinted light green. */
  roomId?: string;
  plan: MapPlan;
  devices: Device[];
  places: Record<string, MapPlacement | null>;
  prefs: Preferences;
  onSelect: (d: Device) => void;
  online?: boolean;
  /** Fully armed: an open contact then shows as red rather than orange. */
  armed?: boolean;
  /** Side-panel layout: the geometry notes and cross-checks fold away. */
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const exterior = plan.model?.scene === "exterior";
  const [yaw, setYaw] = useState(-32),
    [pitch, setPitch] = useState(55),
    [zoom, setZoom] = useState(1),
    [cut, setCut] = useState(!exterior),
    [labels, setLabels] = useState(true);
  const [roof, setRoof] = useState(exterior);
  const [height, setHeight] = useState(plan.model?.defaultHeight || 2.7);
  const pointer = useRef<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
  } | null>(null);
  const mesh = useMemo(
    () => buildHouseMesh(plan, height, cut, roof),
    [plan, height, cut, roof],
  );
  const a = (yaw * Math.PI) / 180,
    b = (pitch * Math.PI) / 180;
  const project = (v: Vec3) => {
    const x = v[0] * Math.cos(a) - v[2] * Math.sin(a),
      z = v[0] * Math.sin(a) + v[2] * Math.cos(a);
    return [
      x,
      z * Math.sin(b) - v[1] * Math.cos(b),
      z * Math.cos(b) + v[1] * Math.sin(b),
    ];
  };
  const all = mesh.faces.flatMap((f) => f.vertices.map(project));
  const minX = Math.min(...all.map((p) => p[0])),
    maxX = Math.max(...all.map((p) => p[0])),
    minY = Math.min(...all.map((p) => p[1])),
    maxY = Math.max(...all.map((p) => p[1]));
  const scale =
    Math.min(880 / Math.max(1, maxX - minX), 520 / Math.max(1, maxY - minY)) *
    zoom;
  const screen = (v: Vec3) => {
    const p = project(v);
    return [
      500 + (p[0] - (minX + maxX) / 2) * scale,
      310 + (p[1] - (minY + maxY) / 2) * scale,
    ];
  };
  const polys = mesh.faces
    .flatMap((face) =>
      triangulate(face.vertices).map((vertices) => ({ ...face, vertices })),
    )
    .map((face, i) => ({
      face,
      i,
      depth:
        face.vertices.map(project).reduce((s, v) => s + v[2], 0) /
        face.vertices.length,
    }))
    .sort((x, y) => x.depth - y.depth);
  const exteriorImage = useMemo(() => {
    if (!exterior) return "";
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 650;
    const context = canvas.getContext("2d")!;
    context.putImageData(
      new ImageData(
        rasterizeHouse(mesh, (v) => [...screen(v), project(v)[2]], 1000, 650),
        1000,
        650,
      ),
      0,
      0,
    );
    return canvas.toDataURL();
  }, [mesh, exterior, yaw, pitch, zoom]);
  const metres = plan.model?.pixelsPerMetre || 44;
  function download() {
    const obj = meshToObj(buildHouseMesh(plan, height, false, true));
    const url = URL.createObjectURL(new Blob([obj], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.id}-estimated.obj`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const notes = (
    <>
      <div className="model-notes">
        <strong>{t("Estimated geometry")}</strong>
        <p>
          {exterior ? (
            t(
              "Outdoor layout, terrain levels, roof heights and boundaries are approximate. This separate exterior study does not establish a cadastral boundary or align the interior sensor plans.",
            )
          ) : (
            <>
              {t(
                "Heights, floor offsets, wall thickness and opening heights are provisional. Plans are viewed separately; alignment between drawings has not been surveyed. This is an architectural model, not a photogrammetric scan.",
              )}
            </>
          )}
        </p>
        {plan.model?.notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
      {!!plan.model?.review.length && (
        <details className="model-review" open>
          <summary>{t("Video / plan cross-check")}</summary>
          {plan.model.review.map((r, i) => (
            <article key={i}>
              <span className={`review-status ${r.status}`}>
                {r.status === "supported"
                  ? t("Supported by video")
                  : r.status === "review"
                    ? t("Needs review")
                    : t("Not established")}
              </span>
              <strong>{r.title}</strong>
              <span>
                {Math.floor(r.seconds / 60)}:
                {String(r.seconds % 60).padStart(2, "0")}
              </span>
              <p>{r.finding}</p>
            </article>
          ))}
        </details>
      )}
      {!!plan.model?.photoReview?.length && (
        <details className="model-review" open>
          <summary>{t("Photo / structure cross-check")}</summary>
          {plan.model.photoReview.map((r, i) => (
            <article key={i}>
              <span className={`review-status ${r.status}`}>
                {r.status === "supported"
                  ? t("Photo-supported")
                  : r.status === "review"
                    ? t("Estimated / review")
                    : t("Not established")}
              </span>
              <strong>{r.title}</strong>
              <p>{r.finding}</p>
              <p className="model-source">
                {t("Sources:")} {r.sources.join(", ")}
              </p>
            </article>
          ))}
        </details>
      )}
    </>
  );
  return (
    <div className="house-model">
      <div className="model-controls">
        {!exterior && (
          <button aria-pressed={cut} onClick={() => setCut(!cut)}>
            {cut ? t("Show full walls") : t("Cutaway walls")}
          </button>
        )}
        {!!plan.model?.surfaces?.some(
          (s) => s.kind === "roof" || s.kind === "ceiling",
        ) && (
          <button
            aria-pressed={roof}
            onClick={() => {
              setRoof(!roof);
              if (!roof) setCut(false);
            }}
          >
            {roof ? t("Hide roof / ceiling") : t("Show roof / ceiling")}
          </button>
        )}
        <button aria-pressed={labels} onClick={() => setLabels(!labels)}>
          {exterior ? t("Area labels") : t("Room labels")}
        </button>
        {!exterior && (
          <label>
            {t("Default ceiling")}{" "}
            <input
              aria-label={t("Assumed ceiling height")}
              type="number"
              min="2"
              max="4"
              step="0.1"
              value={height}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 2 && n <= 4) setHeight(n);
              }}
            />{" "}
            m
          </label>
        )}
        <button
          onClick={() => {
            setYaw(-32);
            setPitch(55);
            setZoom(1);
          }}
        >
          {t("Reset 3D view")}
        </button>
        <button onClick={download}>{t("Export 3D model")}</button>
      </div>
      <svg
        className="model-canvas"
        viewBox="0 0 1000 650"
        role="img"
        aria-label={t("{0} estimated interactive 3D model", plan.label)}
        onPointerDown={(e) => {
          if ((e.target as Element).closest(".model-sensor")) return;
          pointer.current = { x: e.clientX, y: e.clientY, yaw, pitch };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (pointer.current) {
            setYaw(pointer.current.yaw + (e.clientX - pointer.current.x) * 0.4);
            setPitch(
              Math.max(
                15,
                Math.min(
                  85,
                  pointer.current.pitch + (e.clientY - pointer.current.y) * 0.3,
                ),
              ),
            );
          }
        }}
        onPointerUp={() => (pointer.current = null)}
        onPointerCancel={() => (pointer.current = null)}
      >
        <rect width="1000" height="650" fill="var(--surface-alt)" />
        {exteriorImage && (
          <image
            className="model-exterior-render"
            href={exteriorImage}
            width="1000"
            height="650"
          />
        )}
        {!exterior &&
          polys.map(({ face, i }) => (
            <polygon
              key={i}
              data-kind={face.kind}
              points={face.vertices.map((v) => screen(v).join(",")).join(" ")}
              data-selected={
                roomId && face.areaId === roomId ? "true" : undefined
              }
              fill={roomId && face.areaId === roomId ? "#bfe3cb" : face.color}
              fillOpacity={face.kind === "glazing" ? 0.6 : 1}
              stroke={roomId && face.areaId === roomId ? "#bfe3cb" : face.color}
              strokeOpacity={face.kind === "glazing" ? 0.6 : 1}
              strokeWidth="0.6"
            />
          ))}
        {labels &&
          mesh.labels.map((l, i) => {
            const [x, y] = screen(l.point);
            return (
              <text key={i} x={x} y={y} className="model-room-label">
                {l.text}
              </text>
            );
          })}
        {devices
          .filter((d) => places[d.id]?.planId === plan.id)
          .map((d) => {
            const p = places[d.id]!,
              px = p.x * plan.width,
              py = p.y * plan.height,
              z = floorLevel(plan, [px, py]);
            const [x, y] = screen([px / metres, z + 0.1, py / metres]);
            const heading =
              p.heading === undefined ? undefined : (p.heading * Math.PI) / 180;
            const end =
              heading === undefined
                ? undefined
                : screen([
                    px / metres + Math.cos(heading) * 1.3,
                    z + 0.1,
                    py / metres + Math.sin(heading) * 1.3,
                  ]);
            const tone = deviceTone(d, {
              stale: deviceIsStale(d, online),
              armed,
            });
            return (
              <g
                key={d.id}
                className={`model-sensor ${tone}`}
                role="button"
                tabIndex={0}
                aria-label={`${displayDevice(d, prefs)}, ${t(deviceState(d))}`}
                onClick={() => onSelect(d)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d);
                  }
                }}
              >
                <title>
                  {displayDevice(d, prefs)} · {deviceState(d)} {t("· position")}{" "}
                  {p.confirmed ? "confirmed" : "suggested"}
                </title>
                {end && (
                  <path
                    d={`M${x},${y} L${end.join(",")}`}
                    className="model-sensor-heading"
                    strokeWidth="3"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={tone === "healthy" || tone === "neutral" ? 6 : 8}
                  stroke="white"
                  strokeWidth="2"
                  strokeDasharray={p.confirmed ? undefined : "3 2"}
                />
              </g>
            );
          })}
        <text x="20" y="625" className="model-help">
          {exterior
            ? t(
                "Drag to orbit · estimated property envelope · boundaries unconfirmed",
              )
            : t(
                "Drag to orbit · per-plan reconstruction · sensor markers are projected onto the floor",
              )}
        </text>
      </svg>
      <div className="model-controls">
        <label>
          {t("Zoom")}{" "}
          <input
            aria-label={t("3D zoom")}
            type="range"
            min="0.6"
            max="2.5"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label>
          {t("Orbit")}{" "}
          <input
            aria-label={t("3D orbit")}
            type="range"
            min="-180"
            max="180"
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
          />
        </label>
      </div>
      {compact ? (
        <details className="model-about">
          <summary>{t("About this model")}</summary>
          {notes}
        </details>
      ) : (
        notes
      )}
    </div>
  );
}
