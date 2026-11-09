import { it, expect } from "vitest";
import { captureProgress, type CaptureJob } from "../src/shared/cameras";
const job = (): CaptureJob => ({
  running: true,
  stopping: false,
  revision: 0,
  items: [
    { cameraId: "a", name: "A", state: "capturing", startedAt: 1000 },
    { cameraId: "b", name: "B", state: "queued" },
  ],
});
it("estimates remaining time while never completing an in-flight photo", () => {
  expect(captureProgress(job(), 11000)).toMatchObject({
    percent: 20,
    remainingSeconds: 40,
    overdue: false,
  });
  expect(captureProgress(job(), 61000)).toMatchObject({
    percent: 45,
    overdue: true,
    elapsedSeconds: 60,
  });
});
it("learns batch timing from successful captures and excludes pending cameras after stop", () => {
  const j = job();
  j.items[0] = { ...j.items[0], state: "saved", finishedAt: 11000 };
  j.items[1] = { ...j.items[1], state: "capturing", startedAt: 11000 };
  expect(captureProgress(j, 16000)).toMatchObject({
    percent: 75,
    remainingSeconds: 5,
  });
  const stopped = job();
  stopped.stopping = true;
  expect(captureProgress(stopped, 11000).remainingSeconds).toBe(15);
});
it("only reports full completion once all photos are saved", () => {
  const j = job();
  j.running = false;
  j.items[0].state = "saved";
  j.items[1].state = "cancelled";
  expect(captureProgress(j, 10000).percent).toBe(50);
  j.items[1].state = "saved";
  expect(captureProgress(j, 10000).percent).toBe(100);
});

it("includes the live inter-camera pause in its estimate", () => {
  const j = job();
  j.spacingMs = 10000;
  expect(captureProgress(j, 11000).remainingSeconds).toBe(50);
  j.items[0].state = "saved";
  j.pauseUntil = 16000;
  expect(captureProgress(j, 11000).remainingSeconds).toBe(30);
});
