import { demoMap, demoMapImage } from "../../shared/demo-map";
import { validatePlacement } from "../../shared/house-map";
import type { CaptureJob, Photo } from "../../shared/cameras";
import type { Bridge, Preferences } from "../../shared/model";
import { defaults } from "../../shared/model";
import { Monitor } from "../../main/service";
import { SectorApi } from "../../main/api";
const listeners = new Set<Parameters<Bridge["subscribe"]>[0]>();
const demo = new Monitor(
  new SectorApi(
    { hour: 0, used: 0, blockedUntil: 0 },
    () => {},
    async () => {
      throw new Error("Live API is unavailable in browser preview.");
    },
  ),
  (s) => listeners.forEach((cb) => cb(structuredClone(s))),
);
const unavailable = async (): Promise<never> => {
  throw new Error(
    "Open the desktop application to connect securely. Browser preview is demo only.",
  );
};
const demoPhotos: Photo[] = [];
const demoPhotoImages = new Map<string, string>();
let demoJob: CaptureJob = {
  running: false,
  stopping: false,
  items: [],
  revision: 0,
};
const browser: Bridge = {
  houseMap: async () => ({
    ...demoMap(),
    placements: JSON.parse(localStorage.getItem("demo-map-placements") || "{}"),
  }),
  mapImage: async (id) => demoMapImage(id),
  saveMapPlacement: async (id, p) => {
    const data = JSON.parse(
      localStorage.getItem("demo-map-placements") || "{}",
    );
    data[id] = validatePlacement(p, demoMap());
    localStorage.setItem("demo-map-placements", JSON.stringify(data));
  },
  setBudgetOverride: async (enabled) => demo.setBudgetOverride(enabled),
  cameraState: async () => structuredClone(demoJob),
  captureCameras: async (ids) => {
    if (demoJob.running) throw new Error("Capture already running.");
    const devices = await demo.prepareCameras(ids);
    demoJob = {
      running: true,
      stopping: false,
      items: devices.map((d) => ({
        cameraId: d.id,
        name: d.spanish || d.original,
        state: "queued",
      })),
      revision: demoJob.revision + 1,
    };
    void (async () => {
      try {
        for (const item of demoJob.items) {
          if (demoJob.stopping) break;
          item.state = "capturing";
          item.startedAt = Date.now();
          demoJob.revision++;
          await new Promise((resolve) => setTimeout(resolve, 500));
          const id = crypto.randomUUID();
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#253d34"/><path d="M0 270L220 110 440 270 540 180 640 270" fill="none" stroke="#749889" stroke-width="2"/><text x="32" y="45" fill="#d8e8df" font-family="sans-serif" font-size="18">DEMO · Simulated photo</text></svg>`;
          demoPhotoImages.set(
            id,
            `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`,
          );
          demoPhotos.unshift({
            id,
            cameraId: item.cameraId,
            cameraName: item.name,
            room: "Demo home",
            receivedAt: new Date().toISOString(),
            bytes: svg.length,
            demo: true,
          });
          item.state = "saved";
          item.finishedAt = Date.now();
          demoJob.revision++;
        }
      } finally {
        demoJob.items.forEach((i) => {
          if (i.state === "queued") i.state = "cancelled";
        });
        demoJob.running = false;
        demoJob.revision++;
        demo.finishCameras();
      }
    })();
    return structuredClone(demoJob);
  },
  cancelCapture: async () => {
    demoJob.stopping = true;
    return structuredClone(demoJob);
  },
  photoLibrary: async (offset = 0) => ({
    photos: demoPhotos.slice(offset, offset + 48),
    total: demoPhotos.length,
  }),
  photoImage: async (id) => {
    const image = demoPhotoImages.get(id);
    if (!image) throw new Error("Photo not found.");
    return image;
  },
  deletePhoto: async (id) => {
    const i = demoPhotos.findIndex((p) => p.id === id);
    if (i >= 0) demoPhotos.splice(i, 1);
    demoPhotoImages.delete(id);
  },
  exportPhoto: unavailable,

  snapshot: async () => demo.publish(),
  demo: async () => demo.demo(),
  refresh: async () => {
    return demo.refresh(true);
  },
  login: unavailable,
  savedLogin: unavailable,
  select: unavailable,
  logout: async () => demo.demo(),
  command: (...args) => demo.command(...args),
  reconcile: () => demo.reconcile(),
  readOnly: async (v) => demo.readOnly(v),
  scenario: async (n) => demo.scenario(n),
  preferences: async () => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem("home-preferences") || "{}"),
      };
    } catch {
      return defaults;
    }
  },
  savePreferences: async (p: Preferences) => {
    localStorage.setItem("home-preferences", JSON.stringify(p));
  },
  subscribe(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};
export const bridge = window.home || browser;
