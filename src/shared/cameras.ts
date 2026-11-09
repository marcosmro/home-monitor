import type { Device } from "./model";
export const isCamera = (d: Device) =>
  d.source === "cameras" || ["CameraPIR", "OutdoorCameraPIR"].includes(d.type);
export interface Photo {
  id: string;
  cameraId: string;
  cameraName: string;
  room: string;
  receivedAt: string;
  bytes: number;
  demo: boolean;
}
export interface CaptureItem {
  cameraId: string;
  name: string;
  state: "queued" | "capturing" | "saved" | "failed" | "unknown" | "cancelled";
  message?: string;
  startedAt?: number;
  finishedAt?: number;
}
export interface CaptureJob {
  pauseUntil?: number;
  spacingMs?: number;
  running: boolean;
  stopping: boolean;
  items: CaptureItem[];
  revision: number;
}
export interface PhotoPage {
  photos: Photo[];
  total: number;
}

/** Estimated transport progress, never a claim of bytes received. */
export function captureProgress(
  job: CaptureJob,
  now: number,
  defaultMs = 25000,
) {
  const saved = job.items.filter((i) => i.state === "saved");
  const processed =
    saved.length +
    job.items.filter((i) => i.state === "failed" || i.state === "unknown")
      .length;
  const durations = saved
    .filter((i) => i.startedAt !== undefined && i.finishedAt !== undefined)
    .map((i) => Math.max(1, i.finishedAt! - i.startedAt!));
  const typical = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : defaultMs;
  const active = job.items.find((i) => i.state === "capturing");
  const elapsed =
    active?.startedAt === undefined ? 0 : Math.max(0, now - active.startedAt);
  const queued = job.stopping
    ? 0
    : job.items.filter((i) => i.state === "queued").length;
  const fraction = active ? Math.min(0.9, elapsed / typical) : 0;
  return {
    percent: job.items.length
      ? Math.min(
          job.running ? 99 : 100,
          Math.round(((processed + fraction) / job.items.length) * 100),
        )
      : 0,
    remainingSeconds: Math.ceil(
      (queued * typical +
        (active ? Math.max(1000, typical - elapsed) : 0) +
        Math.max(0, (job.pauseUntil || now) - now) +
        Math.max(0, queued - (job.pauseUntil ? 1 : active ? 0 : 1)) *
          (job.spacingMs || 0)) /
        1000,
    ),
    elapsedSeconds: Math.floor(elapsed / 1000),
    overdue: !!active && elapsed > typical,
  };
}
