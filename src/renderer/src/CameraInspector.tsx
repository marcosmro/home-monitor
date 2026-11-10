import { useEffect, useRef, useState } from "react";
import type { Photo } from "../../shared/cameras";
import { madrid } from "../../shared/time";
import { bridge } from "./bridge";
import { PhotoImage, ZoomPhoto } from "./Cameras";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";

type Library = {
  key: string;
  photos: Photo[];
  total: number;
  loading: boolean;
  error: string;
  chosen?: string;
};
const empty: Library = {
  key: "",
  photos: [],
  total: 0,
  loading: false,
  error: "",
};

export function useCameraLibrary(
  cameraId: string | undefined,
  scope: string,
  active: boolean,
) {
  const key = `${scope}:${cameraId || ""}`;
  const [state, setState] = useState<Library>(empty);
  const generation = useRef(0);
  const pending = useRef(false);
  const current =
    state.key === key
      ? state
      : { ...empty, key, loading: !!cameraId && active };
  async function load(offset = 0, chooseOlder = false) {
    if (!cameraId || pending.current) return;
    const token = generation.current;
    pending.current = true;
    setState((old) => ({
      ...(old.key === key ? old : empty),
      key,
      loading: true,
      error: "",
    }));
    try {
      const page = await bridge.photoLibrary(offset, cameraId);
      if (token !== generation.current) return;
      setState((old) => ({
        key,
        photos: offset
          ? [
              ...old.photos,
              ...page.photos.filter(
                (p) => !old.photos.some((existing) => existing.id === p.id),
              ),
            ]
          : page.photos,
        total: page.total,
        loading: false,
        error: "",
        chosen: chooseOlder
          ? page.photos[0]?.id
          : offset
            ? old.chosen
            : page.photos[0]?.id,
      }));
    } catch (e) {
      if (token === generation.current)
        setState((old) => ({
          ...old,
          loading: false,
          error: (e as Error).message,
        }));
    } finally {
      if (token === generation.current) pending.current = false;
    }
  }
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setState({ ...empty, key, loading: !!cameraId && active });
    if (cameraId && active) void load();
    return () => {
      generation.current++;
      pending.current = false;
    };
  }, [key, active]);
  return {
    ...current,
    selected:
      current.photos.find((p) => p.id === current.chosen) || current.photos[0],
    select: (id: string) => setState((old) => ({ ...old, chosen: id })),
    refresh: () => load(),
    more: (chooseOlder = false) => load(current.photos.length, chooseOlder),
  };
}
export type CameraLibrary = ReturnType<typeof useCameraLibrary>;

export function CameraInspector({
  library,
  preview = false,
  onHistory,
  onControls,
}: {
  library: CameraLibrary;
  preview?: boolean;
  onHistory: () => void;
  onControls: () => void;
}) {
  const { t } = useLanguage();
  const photo = preview ? library.photos[0] : library.selected;
  const index = library.photos.findIndex((p) => p.id === photo?.id);
  return (
    <section
      className={`camera-inspector ${preview ? "preview" : ""}`}
      aria-label={t(preview ? "Latest camera photo" : "Camera photo history")}
    >
      <div className="camera-inspector-heading">
        {preview && <h3>{t("Latest saved photo")}</h3>}
        <button
          disabled={library.loading}
          onClick={() => void library.refresh()}
          aria-label={t("Refresh saved photos")}
        >
          <Icon name="refresh" size={13} />
        </button>
      </div>
      {library.error && (
        <p className="warning-text" role="alert">
          {library.error}
        </p>
      )}
      {photo ? (
        <>
          {preview ? (
            <button
              className="camera-latest-preview"
              onClick={() => {
                library.select(photo.id);
                onHistory();
              }}
              aria-label={t("Open latest camera photo")}
            >
              <PhotoImage key={photo.id} photo={photo} />
            </button>
          ) : (
            <div className="inspector-photo-viewer">
              <ZoomPhoto key={photo.id} photo={photo} />
            </div>
          )}
          <p className="camera-saved-time">
            {t("Received")} {madrid(photo.receivedAt, true)} · Madrid
          </p>
          {!preview && (
            <>
              <div className="camera-photo-navigation">
                <button
                  disabled={index <= 0 || library.loading}
                  onClick={() => library.select(library.photos[index - 1].id)}
                >
                  {t("Newer photo")}
                </button>
                <span>
                  {index + 1} / {library.total}
                </span>
                <button
                  disabled={
                    library.loading ||
                    (index === library.photos.length - 1 &&
                      library.photos.length >= library.total)
                  }
                  onClick={() => {
                    if (index < library.photos.length - 1)
                      library.select(library.photos[index + 1].id);
                    else void library.more(true);
                  }}
                >
                  {t("Older photo")}
                </button>
              </div>
              <div className="camera-photo-history">
                {library.photos.map((p) => (
                  <button
                    key={p.id}
                    aria-pressed={p.id === photo.id}
                    onClick={() => library.select(p.id)}
                  >
                    <Icon name="camera" size={14} />
                    <span>{madrid(p.receivedAt, true)}</span>
                    <small>
                      {p.demo ? t("Simulated photo") : t("Saved locally")}
                    </small>
                  </button>
                ))}
              </div>
              {library.photos.length < library.total && (
                <button
                  disabled={library.loading}
                  onClick={() => void library.more()}
                >
                  {t("Load earlier photos")}
                </button>
              )}
            </>
          )}
        </>
      ) : library.loading ? (
        <p className="note" role="status">
          {t("Loading saved photos…")}
        </p>
      ) : (
        !library.error && (
          <div className="camera-inspector-empty">
            <Icon name="camera" size={28} />
            <p>{t("No saved photos for this camera.")}</p>
          </div>
        )
      )}
      <p className="note">
        {t(
          "Saved images, not a live feed. Opening this panel does not take a photo.",
        )}
      </p>
      <div className="camera-inspector-actions">
        {preview && (
          <button onClick={onHistory}>
            {t("Photo history")} <Icon name="arrow" size={12} />
          </button>
        )}
        <button onClick={onControls}>
          {t("Camera controls")} <Icon name="arrow" size={12} />
        </button>
      </div>
    </section>
  );
}
