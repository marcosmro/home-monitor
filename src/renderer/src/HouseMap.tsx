import { PlanDrawing } from "./PlanDrawing";
import { isCamera } from "../../shared/cameras";
import { useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "./bridge";
import { Icon, deviceIcon } from "./icons";
import {
  deviceHealth,
  deviceState,
  displayDevice,
  location,
  type Device,
  type Preferences,
  type Snapshot,
} from "../../shared/model";
import {
  suggestPlacements,
  type HouseMapData,
  type MapPlacement,
} from "../../shared/house-map";
import { temperatureIsStale, temperatureText } from "../../shared/climate";
import { madrid } from "../../shared/time";
function markerTone(d: Device, s: Snapshot) {
  if (d.alarm) return "alarm";
  if (
    d.stale ||
    s.online !== true ||
    d.offline ||
    !Number.isFinite(Date.parse(d.fetchedAt)) ||
    Date.now() - Date.parse(d.fetchedAt) > 1200000
  )
    return "unknown";
  if (d.closed === false || d.batteryLow || d.batteryCritical || d.bypass)
    return "attention";
  return deviceHealth(d) === "OK" && d.closed === true ? "closed" : "unknown";
}
export function HouseMap({
  snap,
  prefs,
}: {
  snap: Snapshot;
  prefs: Preferences;
}) {
  const [data, setData] = useState<HouseMapData>(),
    [error, setError] = useState("");
  const [planId, setPlanId] = useState(""),
    [image, setImage] = useState(""),
    [zoom, setZoom] = useState(1),
    [edit, setEdit] = useState(false);
  const photoDialog = useRef<HTMLDialogElement>(null);
  const [reference, setReference] = useState(false);
  const [showOpenings, setShowOpenings] = useState(true);
  const [photo, setPhoto] = useState("");
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ width: 700, height: 650 });
  const [draft, setDraft] = useState<{ id: string; p: MapPlacement }>();
  const viewport = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    p: MapPlacement;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    bridge
      .houseMap()
      .then((d) => {
        if (alive) {
          setData(d);
          setPlanId(d.plans[0]?.id || "");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!planId) return;
    let alive = true;
    setImage("");
    bridge
      .mapImage(planId)
      .then((s) => {
        if (alive) setImage(s);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    setZoom(1);
    viewport.current?.scrollTo(0, 0);
    return () => {
      alive = false;
    };
  }, [planId]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);
  const suggested = useMemo(
    () => (data ? suggestPlacements(snap.devices, data) : {}),
    [snap.devices, data?.rooms],
  );
  const places = { ...suggested, ...data?.placements };
  if (draft) places[draft.id] = draft.p;
  const current = data?.plans.find((p) => p.id === planId),
    device = snap.devices.find((d) => d.id === selected),
    placement = places[selected];
  const hint = data?.cameraHints?.find((h) => h.deviceId === selected);
  useEffect(() => {
    let alive = true;
    setPhoto("");
    setPhotoUnavailable(false);
    if (hint?.photoId)
      bridge
        .photoImage(hint.photoId)
        .then((value) => {
          if (alive) setPhoto(value);
        })
        .catch(() => {
          if (alive) setPhotoUnavailable(true);
        });
    return () => {
      alive = false;
    };
  }, [hint?.photoId]);
  const bounds =
    current && !reference && current.drawing
      ? current.drawing.bounds
      : [0, 0, current?.width || 1, current?.height || 1];
  function position(p: MapPlacement) {
    return {
      left: `${((p.x * current!.width - bounds[0]) / bounds[2]) * 100}%`,
      top: `${((p.y * current!.height - bounds[1]) / bounds[3]) * 100}%`,
    };
  }
  const unplaced = snap.devices.filter((d) => !places[d.id]).length;
  const pending = snap.devices.filter(
    (d) => places[d.id] && !places[d.id]!.confirmed,
  ).length;
  const visible = snap.devices.filter((d) => {
    const p = places[d.id],
      loc = location(d, prefs),
      matches = `${displayDevice(d, prefs)} ${loc.floor} ${loc.room}`
        .toLowerCase()
        .includes(query.toLowerCase());
    return (
      matches &&
      (filter === "unplaced"
        ? !p
        : filter === "suggested"
          ? p && !p.confirmed
          : filter === "plan"
            ? p?.planId === planId
            : true)
    );
  });
  const width = current
    ? Math.max(
        100,
        Math.min(size.width - 36, ((size.height - 36) * bounds[2]) / bounds[3]),
      ) * zoom
    : 600;
  function select(d: Device) {
    setSelected(d.id);
    const p = places[d.id];
    if (p) setPlanId(p.planId);
  }
  async function save(id: string, p: MapPlacement | null) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await bridge.saveMapPlacement(id, p);
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
                      reason: "Location confirmed or edited locally.",
                    }
                  : null,
              },
            }
          : old,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setDraft(undefined);
    }
  }
  function point(x: number, y: number): MapPlacement {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      planId,
      x: Math.max(
        0.01,
        Math.min(
          0.99,
          (bounds[0] + ((x - rect.left) / rect.width) * bounds[2]) /
            current!.width,
        ),
      ),
      y: Math.max(
        0.01,
        Math.min(
          0.99,
          (bounds[1] + ((y - rect.top) / rect.height) * bounds[3]) /
            current!.height,
        ),
      ),
      ...(placement?.heading !== undefined
        ? { heading: placement.heading }
        : {}),
      confirmed: true,
      reason: "Position edited locally.",
    };
  }
  if (!data)
    return (
      <section className="house-map">
        <h2>House map</h2>
        <p>{error || "Loading local plans…"}</p>
      </section>
    );
  if (!data.plans.length)
    return (
      <section className="house-map">
        <h2>House map</h2>
        <div className="empty">
          No local floor plans have been imported on this Mac.
        </div>
      </section>
    );
  return (
    <section className="house-map">
      <div className="section-heading">
        <div>
          <h2>
            House map <span>{snap.devices.length} sensors</span>
          </h2>
          <p className="camera-intro">
            {pending} suggested · {snap.devices.length - unplaced - pending}{" "}
            confirmed · {unplaced} unplaced
          </p>
        </div>
        <button
          className={edit ? "primary" : ""}
          aria-pressed={edit}
          onClick={() => setEdit(!edit)}
        >
          {edit ? "Finish editing" : "Edit locations"}
        </button>
      </div>
      <div className="map-guidance">
        {edit
          ? "Select a sensor, then click the plan or drag its marker. You can change plans before placing it. Arrow keys move a focused marker."
          : "Dashed markers are suggested positions, not verified mounting points. Select a sensor to review or confirm it."}
      </div>
      {error && (
        <div className="banner warning" role="alert">
          {error}
        </div>
      )}
      <div className="map-layout">
        <div className="map-board">
          <div className="map-toolbar">
            <select
              aria-label="Floor plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {current?.drawing && (
              <>
                <button
                  aria-pressed={reference}
                  onClick={() => setReference(!reference)}
                >
                  {reference ? "Show redraw" : "Original plan"}
                </button>
                <button
                  aria-pressed={showOpenings}
                  onClick={() => setShowOpenings(!showOpenings)}
                >
                  Opening labels
                </button>
              </>
            )}
            <span className="map-toolbar-spacer" />
            <button
              aria-label="Zoom map out"
              disabled={zoom <= 1}
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            >
              −
            </button>
            <output>{Math.round(zoom * 100)}%</output>
            <button
              aria-label="Zoom map in"
              disabled={zoom >= 4}
              onClick={() => setZoom(Math.min(4, zoom + 0.5))}
            >
              +
            </button>
            <button
              onClick={() => {
                setZoom(1);
                viewport.current?.scrollTo(0, 0);
              }}
            >
              Fit plan
            </button>
          </div>
          <div
            ref={viewport}
            className={`map-viewport ${edit ? "editing" : ""}`}
            onPointerDown={(e) => {
              if (edit || (e.target as HTMLElement).closest(".map-pin")) return;
              pan.current = {
                x: e.clientX,
                y: e.clientY,
                left: e.currentTarget.scrollLeft,
                top: e.currentTarget.scrollTop,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (pan.current) {
                e.currentTarget.scrollLeft =
                  pan.current.left + pan.current.x - e.clientX;
                e.currentTarget.scrollTop =
                  pan.current.top + pan.current.y - e.clientY;
              }
            }}
            onPointerUp={() => {
              pan.current = null;
            }}
            onPointerCancel={() => {
              pan.current = null;
            }}
          >
            <div
              ref={canvas}
              className="map-canvas"
              style={{
                width,
                height: current ? (width * bounds[3]) / bounds[2] : 600,
              }}
              onPointerMove={(e) => {
                if (
                  drag.current &&
                  (drag.current.moved ||
                    Math.hypot(
                      e.clientX - drag.current.startX,
                      e.clientY - drag.current.startY,
                    ) > 3)
                ) {
                  drag.current.moved = true;
                  const p = point(e.clientX, e.clientY);
                  drag.current.p = p;
                  setDraft({ id: drag.current.id, p });
                }
              }}
              onPointerUp={(e) => {
                if (drag.current) {
                  e.stopPropagation();
                  const move = drag.current;
                  drag.current = null;
                  if (move.moved) {
                    void save(move.id, move.p);
                  }
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDraft(undefined);
              }}
              onPointerDown={(e) => {
                if (
                  edit &&
                  selected &&
                  !saving &&
                  !(e.target as HTMLElement).closest(".map-pin")
                )
                  void save(selected, point(e.clientX, e.clientY));
              }}
            >
              {current?.drawing && !reference ? (
                <PlanDrawing plan={current} openings={showOpenings} />
              ) : image ? (
                <img
                  className="map-plan-image"
                  src={image}
                  alt={`${current?.label} floor plan`}
                  draggable={false}
                />
              ) : (
                <div className="empty">Loading plan…</div>
              )}
              <svg
                className="map-camera-directions"
                viewBox={bounds.join(" ")}
                aria-hidden="true"
              >
                {snap.devices
                  .filter(
                    (d) =>
                      isCamera(d) &&
                      places[d.id]?.planId === planId &&
                      places[d.id]?.heading !== undefined,
                  )
                  .map((d) => {
                    const p = places[d.id]!;
                    return (
                      <g
                        key={d.id}
                        transform={`translate(${p.x * current!.width} ${p.y * current!.height}) rotate(${p.heading})`}
                      >
                        <path
                          d="M0,0 L90,-38 A98,98 0 0 1 90,38 Z"
                          className={
                            selected === d.id
                              ? "camera-direction selected"
                              : "camera-direction"
                          }
                        />
                        <path
                          d="M8,0 H75 M68,-5 L75,0 L68,5"
                          className="camera-direction-arrow"
                        />
                      </g>
                    );
                  })}
              </svg>
              {snap.devices
                .filter((d) => places[d.id]?.planId === planId)
                .map((d) => {
                  const p = places[d.id]!,
                    name = displayDevice(d, prefs);
                  return (
                    <button
                      key={d.id}
                      className={`map-pin ${markerTone(d, snap)} ${p.confirmed ? "confirmed" : "suggested"} ${selected === d.id ? "selected" : ""}`}
                      style={position(p)}
                      aria-label={`${name}, ${location(d, prefs).room}, ${deviceState(d)}, ${deviceHealth(d)}, ${p.confirmed ? "confirmed" : "suggested"} location`}
                      title={`${name} · ${deviceState(d)} · ${p.confirmed ? "Confirmed" : "Suggested"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(d.id);
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelected(d.id);
                        if (edit && !saving) {
                          drag.current = {
                            id: d.id,
                            p,
                            startX: e.clientX,
                            startY: e.clientY,
                            moved: false,
                          };
                          canvas.current?.setPointerCapture(e.pointerId);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          edit &&
                          !saving &&
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                          ].includes(e.key)
                        ) {
                          e.preventDefault();
                          const delta = e.shiftKey ? 0.02 : 0.005;
                          void save(d.id, {
                            ...p,
                            x: Math.max(
                              0.01,
                              Math.min(
                                0.99,
                                p.x +
                                  (e.key === "ArrowLeft"
                                    ? -delta
                                    : e.key === "ArrowRight"
                                      ? delta
                                      : 0),
                              ),
                            ),
                            y: Math.max(
                              0.01,
                              Math.min(
                                0.99,
                                p.y +
                                  (e.key === "ArrowUp"
                                    ? -delta
                                    : e.key === "ArrowDown"
                                      ? delta
                                      : 0),
                              ),
                            ),
                          });
                        }
                      }}
                    >
                      <Icon name={deviceIcon(d.type)} size={14} />
                      {d.mountIndex !== undefined && (
                        <small>{d.mountIndex}</small>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="map-legend">
            <span>● Alarm</span>
            <span>● Open / attention</span>
            <span>● Closed & healthy</span>
            <span>● Unknown / offline / stale</span>
            <small>
              Blue = glazing · brown = door swing · V/P labels identify
              openings, not API sensor numbers · camera arrows show inferred
              direction, not measured coverage
            </small>
          </div>
        </div>
        <aside className="map-sidebar" aria-label="Map sensors">
          {device ? (
            <div className="map-selection">
              <div className="panel-heading">
                <h3>{displayDevice(device, prefs)}</h3>
                <button
                  className="icon-button"
                  aria-label="Close sensor selection"
                  onClick={() => setSelected("")}
                >
                  ×
                </button>
              </div>
              <p>
                {location(device, prefs).floor} · {location(device, prefs).room}
              </p>
              <div className="map-state">
                <strong>{deviceState(device)}</strong>
                <span>{deviceHealth(device)}</span>
              </div>
              <p>
                {temperatureText(device.temperature)}
                {device.temperature !== undefined ? "C" : ""}
                {device.temperature !== undefined &&
                temperatureIsStale(device, snap)
                  ? " · last known"
                  : ""}{" "}
                · Fetched {madrid(device.fetchedAt)} Madrid
              </p>
              {hint && (
                <div className="map-photo-evidence">
                  <strong>
                    Photo-based placement · {hint.confidence} confidence
                  </strong>
                  {photo ? (
                    <button
                      className="map-photo-button"
                      aria-label="Enlarge reference photo"
                      onClick={() => photoDialog.current?.showModal()}
                    >
                      <img
                        src={photo}
                        alt={`Saved ${location(device, prefs).room} camera view used to infer placement`}
                      />
                    </button>
                  ) : (
                    <p>
                      {photoUnavailable || !hint.photoId
                        ? "Reference photo is no longer available locally."
                        : "Loading saved reference photo…"}
                    </p>
                  )}
                  {photo && (
                    <dialog
                      className="map-photo-modal"
                      ref={photoDialog}
                      onClick={(e) => {
                        if (e.target === e.currentTarget)
                          e.currentTarget.close();
                      }}
                    >
                      <button onClick={() => photoDialog.current?.close()}>
                        Close photo
                      </button>
                      <img src={photo} alt="Saved camera reference" />
                    </dialog>
                  )}
                  <p>{hint.evidence}</p>
                  {edit && (
                    <button
                      disabled={saving}
                      onClick={() => void save(device.id, suggested[device.id])}
                    >
                      Use photo-based position
                    </button>
                  )}
                </div>
              )}
              <div className="map-placement-note">
                {placement
                  ? placement.confirmed
                    ? "Location confirmed locally."
                    : hint
                      ? "Suggested from the reference photo. Confirm or adjust the position and direction."
                      : placement.reason
                  : "Unplaced. Select Edit locations, choose a plan, and click its position."}
              </div>
              {placement && !placement.confirmed && (
                <button
                  disabled={saving}
                  onClick={() => void save(device.id, placement)}
                >
                  Confirm this location
                </button>
              )}
              {edit && (
                <>
                  {isCamera(device) && placement && (
                    <label>
                      Camera direction: {Math.round(placement.heading || 0)}°
                      <input
                        aria-label="Camera direction"
                        type="range"
                        min="0"
                        max="359"
                        step="1"
                        value={placement.heading || 0}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft({
                            id: device.id,
                            p: {
                              ...placement,
                              heading: Number(e.target.value),
                            },
                          })
                        }
                        onPointerUp={() => {
                          if (draft) void save(device.id, draft.p);
                        }}
                        onKeyUp={() => {
                          if (draft) void save(device.id, draft.p);
                        }}
                        onBlur={() => {
                          if (draft) void save(device.id, draft.p);
                        }}
                      />
                      <small>
                        0° right · 90° down · 180° left · 270° up. Direction
                        only; coverage is not calibrated.
                      </small>
                    </label>
                  )}
                  <label>
                    Room on plan
                    <select
                      aria-label="Assign map room"
                      value={
                        placement?.planId === planId
                          ? placement.roomId || ""
                          : ""
                      }
                      disabled={saving}
                      onChange={(e) => {
                        const room = data.rooms.find(
                          (r) => r.id === e.target.value,
                        );
                        if (room)
                          void save(device.id, {
                            planId: room.planId,
                            roomId: room.id,
                            x: room.center[0],
                            y: room.center[1],
                            confirmed: true,
                            reason:
                              "Room selected locally; move marker to exact position.",
                          });
                      }}
                    >
                      <option value="">Choose room or click the plan</option>
                      {data.rooms
                        .filter((r) => r.planId === planId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  {current?.drawing && (
                    <label>
                      Place at identified opening
                      <select
                        aria-label="Place at identified opening"
                        value=""
                        disabled={saving}
                        onChange={(e) => {
                          const opening = current.drawing!.openings.find(
                            (o) => o.id === e.target.value,
                          );
                          if (opening)
                            void save(device.id, {
                              planId,
                              roomId: data.rooms.some(
                                (r) => r.id === opening.roomId,
                              )
                                ? opening.roomId
                                : undefined,
                              x:
                                (opening.a[0] + opening.b[0]) /
                                2 /
                                current.width,
                              y:
                                (opening.a[1] + opening.b[1]) /
                                2 /
                                current.height,
                              ...(placement?.heading !== undefined
                                ? { heading: placement.heading }
                                : {}),
                              confirmed: true,
                              reason: "Opening selected locally.",
                            });
                        }}
                      >
                        <option value="">Choose a door or window</option>
                        {current.drawing.openings.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.id} ·{" "}
                            {data.rooms.find((r) => r.id === o.roomId)?.label ||
                              o.roomId}{" "}
                            · {o.kind}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    disabled={saving || !placement}
                    onClick={() => void save(device.id, null)}
                  >
                    Remove from map
                  </button>
                </>
              )}
              {saving && <p role="status">Saving location…</p>}
            </div>
          ) : (
            <div className="map-selection">
              <h3>Place your sensors</h3>
              <p>
                Select a marker or a sensor below. Review suggested positions
                before relying on them.
              </p>
            </div>
          )}
          <input
            aria-label="Find a map sensor"
            placeholder="Find a sensor or room"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter map sensors"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All sensors ({snap.devices.length})</option>
            <option value="plan">On this plan</option>
            <option value="suggested">Suggested ({pending})</option>
            <option value="unplaced">Unplaced ({unplaced})</option>
          </select>
          <div className="map-sensor-list">
            {visible.map((d) => {
              const p = places[d.id];
              return (
                <button
                  key={d.id}
                  className={selected === d.id ? "active" : ""}
                  onClick={() => select(d)}
                >
                  <Icon name={deviceIcon(d.type)} size={16} />
                  <span>
                    <strong>{displayDevice(d, prefs)}</strong>
                    <small>
                      {location(d, prefs).room} ·{" "}
                      {p
                        ? p.confirmed
                          ? "Confirmed"
                          : "Suggested"
                        : "Unplaced"}
                    </small>
                  </span>
                  <i className={`map-state-dot ${markerTone(d, snap)}`} />
                </button>
              );
            })}
            {!visible.length && <p>No matching sensors.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
