import { useLanguage } from "./i18n";
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

// Share image reads between the thumbnail and viewer of one library result.
// Metadata objects are scoped to a library response, so identical IDs from a
// different account never reuse image bytes. Dropped pages can be collected.
const photoImages = new WeakMap<Photo, Promise<string>>();
function readPhotoImage(photo: Photo) {
  const existing = photoImages.get(photo);
  if (existing) return existing;
  const request = bridge.photoImage(photo.id).catch((error) => {
    photoImages.delete(photo);
    throw error;
  });
  photoImages.set(photo, request);
  return request;
}

export function PhotoImage({
  photo,
  large = false,
  zoom = 1,
}: {
  photo: Photo;
  large?: boolean;
  zoom?: number;
}) {
  const { t } = useLanguage();
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSrc("");
    setError("");
    readPhotoImage(photo)
      .then((value) => {
        if (active) setSrc(value);
      })
      .catch(() => {
        if (active) setError("Photo unavailable");
      });
    return () => {
      active = false;
    };
  }, [photo]);
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
          alt={t(
            "{0}, received {1} Madrid",
            photo.demo ? t("Simulated photo") : photo.cameraName,
            madrid(photo.receivedAt, true),
          )}
        />
      ) : (
        <span>{error ? t(error) : t("Loading photo…")}</span>
      )}
      {photo.demo && <span className="photo-demo">{t("Simulated photo")}</span>}
    </div>
  );
}
export function ZoomPhoto({ photo }: { photo: Photo }) {
  const { t } = useLanguage();
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
          {zoom === 1
            ? t("Fit to window")
            : t("Drag to pan · double-click to fit")}
        </span>
        <button
          aria-label={t("Zoom out")}
          disabled={zoom === 1}
          onClick={() => adjust(zoom - 0.5)}
        >
          −
        </button>
        <output aria-label={t("Photo zoom")}>{Math.round(zoom * 100)}%</output>
        <button
          aria-label={t("Zoom in")}
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
          {t("Fit")}
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
  initialCameraId,
  onInspect,
}: {
  snap: Snapshot;
  prefs: Preferences;
  initialCameraId?: string;
  onInspect?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const cameras = snap.devices.filter(isCamera);
  const [now, setNow] = useState(Date.now());
  const viewer = useRef<HTMLDialogElement>(null);
  const focusedCard = useRef<HTMLElement>(null);
  useEffect(() => {
    if (initialCameraId)
      focusedCard.current?.scrollIntoView({ block: "center" });
  }, [initialCameraId]);
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
    [filter, setFilter] = useState(initialCameraId || "all");
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
          setJob((previous) =>
            previous.revision === value.revision &&
            previous.running === value.running &&
            previous.stopping === value.stopping
              ? previous
              : value,
          );
          if (value.running) setNow(Date.now());
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
            {t("Cameras")}{" "}
            <span>
              {cameras.length} {t("cameras")}
            </span>
          </h2>
          <p className="camera-intro">
            {t("Snapshots and local photo history.")}
          </p>
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
          <Icon name="camera" /> {t("Capture all")}
          {eligible.length > 0 ? ` (${eligible.length})` : ""}
        </button>
      </div>
      <div className="camera-note">
        <Icon name="clock" />
        <span>
          {t(
            "One camera at a time · usually 20–30 seconds each · 10-second pause between live captures.",
          )}{" "}
          {snap.demo
            ? t("Demo captures are simulated.")
            : t(
                "{0}. Each photo uses one request, plus status/authentication checks.",
                snap.requestBudget?.override
                  ? t("Local hourly cap overridden")
                  : t(
                      "{0} requests left in this app’s hourly budget",
                      Math.max(0, 44 - snap.requests),
                    ),
              )}{" "}
          {snap.readOnly &&
            !snap.demo &&
            t(
              "Photo capture is available while alarm controls remain read-only.",
            )}
        </span>
      </div>
      {!ready && (
        <div className="banner warning">
          {t(
            "Capture is available when the system is connected and fully armed. Saved photos remain available.",
          )}
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
                  ? t("Finishing current photo…")
                  : job.pauseUntil
                    ? t("Pausing before the next camera…")
                    : t(
                        "Capturing · {0} of {1} saved",
                        completed,
                        job.items.length,
                      )
                : t(
                    "{0} of {1} photos saved{2}",
                    completed,
                    job.items.length,
                    (
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
                        return count ? ` · ${count} ${t(label)}` : "";
                      })
                      .join(""),
                  )}
            </strong>
            <span>
              {job.running
                ? job.pauseUntil
                  ? t(
                      "Next camera in {0}s · about {1} remaining",
                      Math.max(0, Math.ceil((job.pauseUntil - now) / 1000)),
                      timeLeft,
                    )
                  : progress.overdue
                    ? t(
                        "Taking longer than estimated · current camera {0}s elapsed",
                        progress.elapsedSeconds,
                      )
                    : t(
                        "About {0} remaining · estimate, not upload progress",
                        timeLeft,
                      )
                : t("No captures are retried automatically.")}
            </span>
            <div
              className="capture-track"
              role="progressbar"
              aria-label={t("Estimated capture progress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-valuetext={t(
                "{0} photos saved{1}",
                completed,
                job.running ? t(", approximately {0} remaining", timeLeft) : "",
              )}
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
                ? t("Stop remaining photos")
                : t("Stop after current photo")}
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
              ref={initialCameraId === d.id ? focusedCard : undefined}
              className={`camera-card ${initialCameraId === d.id ? "is-selected" : ""} ${item?.state === "capturing" ? "is-capturing" : ""}`}
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
                    aria-label={t(
                      "View latest photo from {0}",
                      displayDevice(d, prefs),
                    )}
                  >
                    <PhotoImage photo={latest} />
                  </button>
                ) : (
                  <div className="camera-empty">
                    <Icon name="camera" size={32} />
                    <span>{t("No saved photo yet")}</span>
                  </div>
                )}
                {item?.state === "capturing" && (
                  <div className="camera-capture-overlay">
                    <span className="capture-spinner" aria-hidden="true" />
                    <span>{t("Capturing…")}</span>
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
                      ? t("Previous photo")
                      : t("Latest saved photo")}{" "}
                    · {madrid(latest.receivedAt, true)}
                  </p>
                )}
                {onInspect && (
                  <button
                    className="camera-inspect-link"
                    onClick={() => onInspect(d.id)}
                  >
                    {t("Show on floor plan")} <Icon name="arrow" size={12} />
                  </button>
                )}
                <div className="camera-card-actions">
                  <span
                    className={item?.state === "failed" ? "camera-error" : ""}
                  >
                    {item
                      ? {
                          queued: t("Waiting"),
                          capturing: t("Taking photo…"),
                          saved: t("Saved locally"),
                          failed: t("Capture failed"),
                          unknown: t("Outcome unknown"),
                          cancelled: t("Skipped"),
                        }[item.state]
                      : d.offline || d.active === false
                        ? t("Unavailable")
                        : t("Ready to capture")}
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
                    {t("Take photo")}
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
          {t("No photo cameras were returned for this property.")}
        </div>
      )}
      <div className="section-heading gallery-heading">
        <div>
          <h2>
            {t("Photo history")}{" "}
            <span>
              {total} {t("saved")}
            </span>
          </h2>
          <p className="camera-intro">
            {t(
              "Newest first · received time in Europe/Madrid · stored until you delete them",
            )}
          </p>
        </div>
        <label>
          {t("Camera")}{" "}
          <select
            aria-label={t("Filter photo history by camera")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t("All cameras")}</option>
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
            ? t(
                "No photos from this camera in the loaded history. Load older photos below.",
              )
            : t(
                "Your captures will appear here. No cloud photo library is downloaded.",
              )}
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
          {t("Load older photos (")}
          {photos.length} {t("of")} {total})
        </button>
      )}
      <p className="camera-storage">
        {window.home
          ? t(
              "Stored privately in Home Monitor’s local application-data folder. Export a photo to save a copy elsewhere. ",
            )
          : t(
              "Browser demo: photos are held in memory for this preview only. The desktop app saves them to disk.",
            )}
      </p>
      {selected && (
        <dialog
          ref={viewer}
          className="photo-dialog"
          aria-label={t("Saved photo")}
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
                  {selected.room} {t("· received")}{" "}
                  {madrid(selected.receivedAt, true)} Madrid
                </p>
              </div>
              <button
                autoFocus
                onClick={() => setSelected(undefined)}
                aria-label={t("Close photo")}
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
                {selected.demo
                  ? t("Simulated image")
                  : t("Original camera image")}
              </span>
              <button
                disabled={busy || !window.home}
                onClick={() =>
                  void action(() => bridge.exportPhoto(selected.id))
                }
              >
                {t("Export photo…")}
              </button>
              <button disabled={busy} onClick={() => setDeleteConfirm(true)}>
                {t("Delete…")}
              </button>
            </div>
            {deleteConfirm && (
              <div className="photo-delete">
                <span>{t("Permanently delete this local photo?")}</span>
                <button onClick={() => setDeleteConfirm(false)}>
                  {t("Keep photo")}
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
                  {t("Delete permanently")}
                </button>
              </div>
            )}
          </section>
        </dialog>
      )}
    </section>
  );
}
