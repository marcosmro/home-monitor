import { BudgetNotice } from "./BudgetNotice";
import { useEffect, useRef, useState } from "react";
import {
  captureProgress,
  isCamera,
  type CaptureJob,
  type Photo,
} from "../../shared/cameras";
import {
  displayDevice,
  location,
  type Snapshot,
  type Preferences,
} from "../../shared/model";
import { madrid } from "../../shared/time";
import { bridge } from "./bridge";
import { Icon } from "./icons";

function PhotoImage({
  photo,
  large = false,
  zoom = 1,
}: {
  photo: Photo;
  large?: boolean;
  zoom?: number;
}) {
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    bridge
      .photoImage(photo.id)
      .then((value) => {
        if (active) setSrc(value);
      })
      .catch(() => {
        if (active) setError("Photo unavailable");
      });
    return () => {
      active = false;
    };
  }, [photo.id]);
  return (
    <div
      className={`photo-image ${large ? "large" : ""}`}
      style={
        large
          ? { width: `${zoom * 100}%`, height: `${zoom * 100}%` }
          : undefined
      }
    >
      {src ? (
        <img
          onError={() => {
            setSrc("");
            setError("Photo could not be decoded");
          }}
          src={src}
          alt={`${photo.demo ? "Simulated photo" : photo.cameraName}, received ${madrid(photo.receivedAt, true)} Madrid`}
        />
      ) : (
        <span>{error || "Loading photo…"}</span>
      )}
      {photo.demo && <span className="photo-demo">Simulated photo</span>}
    </div>
  );
}
function ZoomPhoto({ photo }: { photo: Photo }) {
  const [zoom, setZoom] = useState(1);
  const pan = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const adjust = (value: number) => setZoom(Math.max(1, Math.min(4, value)));
  return (
    <>
      <div className="photo-zoom-toolbar">
        <span>
          {zoom === 1 ? "Fit to window" : "Drag to pan · double-click to fit"}
        </span>
        <button
          aria-label="Zoom out"
          disabled={zoom === 1}
          onClick={() => adjust(zoom - 0.5)}
        >
          −
        </button>
        <output aria-label="Photo zoom">{Math.round(zoom * 100)}%</output>
        <button
          aria-label="Zoom in"
          disabled={zoom === 4}
          onClick={() => adjust(zoom + 0.5)}
        >
          +
        </button>
        <button
          onClick={() => {
            setZoom(1);
            pan.current?.scrollTo(0, 0);
          }}
        >
          Fit
        </button>
      </div>
      <div
        ref={pan}
        className={`photo-pan ${zoom > 1 ? "zoomed" : ""}`}
        onDoubleClick={() => {
          adjust(zoom === 1 ? 2 : 1);
          pan.current?.scrollTo(0, 0);
        }}
        onPointerDown={(e) => {
          if (zoom === 1 || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            e.currentTarget.scrollLeft =
              drag.current.left + drag.current.x - e.clientX;
            e.currentTarget.scrollTop =
              drag.current.top + drag.current.y - e.clientY;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <PhotoImage photo={photo} large zoom={zoom} />
      </div>
    </>
  );
}
export function Cameras({
  snap,
  prefs,
}: {
  snap: Snapshot;
  prefs: Preferences;
}) {
  const cameras = snap.devices.filter(isCamera);
  const [now, setNow] = useState(Date.now());
  const viewer = useRef<HTMLDialogElement>(null);
  const [job, setJob] = useState<CaptureJob>({
    running: false,
    stopping: false,
    items: [],
    revision: 0,
  });
  const [photos, setPhotos] = useState<Photo[]>([]),
    [total, setTotal] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Photo>(),
    [filter, setFilter] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  useEffect(() => {
    if (selected) viewer.current?.showModal();
  }, [selected]);
  async function reload() {
    const page = await bridge.photoLibrary();
    setPhotos(page.photos);
    setTotal(page.total);
  }
  useEffect(() => {
    let alive = true,
      pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = await bridge.cameraState();
        if (alive) {
          setJob(value);
          setNow(Date.now());
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [job.revision]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(undefined);
        setDeleteConfirm(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function capture(ids: string[]) {
    setError("");
    setBusy(true);
    try {
      setJob(await bridge.captureCameras(ids));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const eligible = cameras.filter((d) => !d.offline && d.active !== false);
  const ready = snap.online === true && snap.mode === "armed";
  const locked = busy || job.running;
  const shown = photos.filter((p) => filter === "all" || p.cameraId === filter);
  const completed = job.items.filter((i) => i.state === "saved").length;
  const progress = captureProgress(job, now, snap.demo ? 700 : 25000);
  const timeLeft =
    progress.remainingSeconds >= 60
      ? `${Math.ceil(progress.remainingSeconds / 60)} min`
      : `${progress.remainingSeconds}s`;
  return (
    <section className="cameras-panel">
      <div className="section-heading">
        <div>
          <h2>
            Cameras <span>{cameras.length} cameras</span>
          </h2>
          <p className="camera-intro">Snapshots and local photo history.</p>
        </div>
        <button
          className="primary"
          disabled={
            locked ||
            !ready ||
            !eligible.length ||
            (!snap.demo &&
              !snap.requestBudget?.override &&
              snap.requests + eligible.length + 2 > 44)
          }
          onClick={() => void capture(eligible.map((d) => d.id))}
        >
          <Icon name="camera" /> Capture all
          {eligible.length > 0 ? ` (${eligible.length})` : ""}
        </button>
      </div>
      <div className="camera-note">
        <Icon name="clock" />
        <span>
          One camera at a time · usually 20–30 seconds each · 10-second pause
          between live captures.{" "}
          {snap.demo
            ? "Demo captures are simulated."
            : `${snap.requestBudget?.override ? "Local hourly cap overridden" : `${Math.max(0, 44 - snap.requests)} requests left in this app’s hourly budget`}. Each photo uses one request, plus status/authentication checks.`}{" "}
          {snap.readOnly &&
            !snap.demo &&
            "Photo capture is available while alarm controls remain read-only."}
        </span>
      </div>
      {!ready && (
        <div className="banner warning">
          Capture is available when the system is connected and fully armed.
          Saved photos remain available.
        </div>
      )}
      {error && (
        <div className="banner warning" role="alert">
          {error}
        </div>
      )}
      {job.items.length > 0 && (
        <div className="capture-progress" role="status">
          <div className="capture-progress-body">
            <strong>
              {job.running
                ? job.stopping
                  ? "Finishing current photo…"
                  : job.pauseUntil
                    ? "Pausing before the next camera…"
                    : `Capturing · ${completed} of ${job.items.length} saved`
                : `${completed} of ${job.items.length} photos saved${(
                    [
                      ["failed", "failed"],
                      ["unknown", "unknown"],
                      ["cancelled", "skipped"],
                    ] as const
                  )
                    .map(([state, label]) => {
                      const count = job.items.filter(
                        (i) => i.state === state,
                      ).length;
                      return count ? ` · ${count} ${label}` : "";
                    })
                    .join("")}`}
            </strong>
            <span>
              {job.running
                ? job.pauseUntil
                  ? `Next camera in ${Math.max(0, Math.ceil((job.pauseUntil - now) / 1000))}s · about ${timeLeft} remaining`
                  : progress.overdue
                    ? `Taking longer than estimated · current camera ${progress.elapsedSeconds}s elapsed`
                    : `About ${timeLeft} remaining · estimate, not upload progress`
                : "No captures are retried automatically."}
            </span>
            <div
              className="capture-track"
              role="progressbar"
              aria-label="Estimated capture progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-valuetext={`${completed} photos saved${job.running ? `, approximately ${timeLeft} remaining` : ""}`}
            >
              <div style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
          {job.running && (
            <button
              disabled={job.stopping}
              onClick={() =>
                void action(async () => setJob(await bridge.cancelCapture()))
              }
            >
              {job.pauseUntil
                ? "Stop remaining photos"
                : "Stop after current photo"}
            </button>
          )}
        </div>
      )}
      {!snap.demo &&
        !snap.requestBudget?.override &&
        snap.requests + eligible.length + 2 > 44 &&
        !snap.requestBudget?.localPaused && (
          <BudgetNotice snap={snap} available />
        )}
      <div className="camera-grid">
        {cameras.map((d) => {
          const loc = location(d, prefs),
            item = job.items.find((i) => i.cameraId === d.id),
            latest = photos.find((p) => p.cameraId === d.id);
          return (
            <article
              className={`camera-card ${item?.state === "capturing" ? "is-capturing" : ""}`}
              key={d.id}
            >
              <div className="camera-thumbnail">
                {latest ? (
                  <button
                    className="camera-preview"
                    onClick={() => {
                      setSelected(latest);
                      setDeleteConfirm(false);
                    }}
                    aria-label={`View latest photo from ${displayDevice(d, prefs)}`}
                  >
                    <PhotoImage photo={latest} />
                  </button>
                ) : (
                  <div className="camera-empty">
                    <Icon name="camera" size={32} />
                    <span>No saved photo yet</span>
                  </div>
                )}
                {item?.state === "capturing" && (
                  <div className="camera-capture-overlay">
                    <span className="capture-spinner" aria-hidden="true" />
                    <span>Capturing…</span>
                  </div>
                )}
              </div>
              <div className="camera-card-body">
                <h3>{displayDevice(d, prefs)}</h3>
                <p>
                  {loc.floor} · {loc.room}
                </p>
                {latest && (
                  <p className="camera-photo-time">
                    {item && item.state !== "saved"
                      ? "Previous photo"
                      : "Latest saved photo"}{" "}
                    · {madrid(latest.receivedAt, true)}
                  </p>
                )}
                <div className="camera-card-actions">
                  <span
                    className={item?.state === "failed" ? "camera-error" : ""}
                  >
                    {item
                      ? {
                          queued: "Waiting",
                          capturing: "Taking photo…",
                          saved: "Saved locally",
                          failed: "Capture failed",
                          unknown: "Outcome unknown",
                          cancelled: "Skipped",
                        }[item.state]
                      : d.offline || d.active === false
                        ? "Unavailable"
                        : "Ready to capture"}
                  </span>
                  <button
                    disabled={
                      locked ||
                      !ready ||
                      d.offline ||
                      d.active === false ||
                      (!snap.demo &&
                        !snap.requestBudget?.override &&
                        snap.requests + 3 > 44)
                    }
                    onClick={() => void capture([d.id])}
                  >
                    Take photo
                  </button>
                </div>
                {item?.message && (
                  <p className="camera-error">{item.message}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!cameras.length && (
        <div className="empty">
          No photo cameras were returned for this property.
        </div>
      )}
      <div className="section-heading gallery-heading">
        <div>
          <h2>
            Photo history <span>{total} saved</span>
          </h2>
          <p className="camera-intro">
            Newest first · received time in Europe/Madrid · stored until you
            delete them
          </p>
        </div>
        <label>
          Camera{" "}
          <select
            aria-label="Filter photo history by camera"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All cameras</option>
            {[
              ...new Map([
                ...cameras.map(
                  (d) =>
                    [
                      d.id,
                      `${displayDevice(d, prefs)} · ${location(d, prefs).room}`,
                    ] as const,
                ),
                ...photos.map(
                  (p) => [p.cameraId, `${p.cameraName} · ${p.room}`] as const,
                ),
              ]).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shown.length ? (
        <div className="photo-grid">
          {shown.map((p) => (
            <button
              className="photo-tile"
              key={p.id}
              onClick={() => {
                setSelected(p);
                setDeleteConfirm(false);
              }}
            >
              <PhotoImage photo={p} />
              <strong>{p.cameraName}</strong>
              <span>{p.room}</span>
              <span>{madrid(p.receivedAt, true)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          {total
            ? "No photos from this camera in the loaded history. Load older photos below."
            : "Your captures will appear here. No cloud photo library is downloaded."}
        </div>
      )}
      {photos.length < total && (
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const page = await bridge.photoLibrary(photos.length);
              setPhotos([...photos, ...page.photos]);
              setTotal(page.total);
            })
          }
        >
          Load older photos ({photos.length} of {total})
        </button>
      )}
      <p className="camera-storage">
        {window.home
          ? "Stored privately in Home Monitor’s local application-data folder. Export a photo to save a copy elsewhere. "
          : "Browser demo: photos are held in memory for this preview only. The desktop app saves them to disk."}
      </p>
      {selected && (
        <dialog
          ref={viewer}
          className="photo-dialog"
          aria-label="Saved photo"
          onCancel={() => setSelected(undefined)}
        >
          <section
            className="photo-viewer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <h2>{selected.cameraName}</h2>
                <p>
                  {selected.room} · received {madrid(selected.receivedAt, true)}{" "}
                  Madrid
                </p>
              </div>
              <button
                autoFocus
                onClick={() => setSelected(undefined)}
                aria-label="Close photo"
              >
                ×
              </button>
            </div>
            {error && (
              <p role="alert" className="camera-error">
                {error}
              </p>
            )}
            <ZoomPhoto key={selected.id} photo={selected} />
            <div className="photo-viewer-actions">
              <span>
                {(selected.bytes / 1024).toFixed(0)} KB ·{" "}
                {selected.demo ? "Simulated image" : "Original camera image"}
              </span>
              <button
                disabled={busy || !window.home}
                onClick={() =>
                  void action(() => bridge.exportPhoto(selected.id))
                }
              >
                Export photo…
              </button>
              <button disabled={busy} onClick={() => setDeleteConfirm(true)}>
                Delete…
              </button>
            </div>
            {deleteConfirm && (
              <div className="photo-delete">
                <span>Permanently delete this local photo?</span>
                <button onClick={() => setDeleteConfirm(false)}>
                  Keep photo
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await bridge.deletePhoto(selected.id);
                      setSelected(undefined);
                      setDeleteConfirm(false);
                      await reload();
                    })
                  }
                >
                  Delete permanently
                </button>
              </div>
            )}
          </section>
        </dialog>
      )}
    </section>
  );
}
