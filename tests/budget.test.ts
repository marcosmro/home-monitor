import { it, expect, vi, afterEach } from "vitest";
import { SectorApi } from "../src/main/api";
const meter = () => ({
  hour: Math.floor(Date.now() / 3600000),
  used: 44,
  blockedUntil: 0,
});
afterEach(() => vi.useRealTimers());
it("blocks by default, permits an explicit override, and keeps counting", async () => {
  const m = meter(),
    fetcher = vi.fn().mockResolvedValue(new Response("{}"));
  const api = new SectorApi(m, () => {}, fetcher);
  await expect(api.request("/read", undefined, false)).rejects.toThrow(
    "budget paused",
  );
  expect(fetcher).not.toHaveBeenCalled();
  api.setBudgetOverride(true);
  await api.request("/read", undefined, false);
  expect(api.used).toBe(45);
  api.setBudgetOverride(false);
  await expect(api.request("/read", undefined, false)).rejects.toThrow(
    "budget paused",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not persist overrides and expires them at the hour boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T12:59:00Z"));
  const m = meter(),
    api = new SectorApi(m);
  api.setBudgetOverride(true);
  expect(api.budget.override).toBe(true);
  expect(new SectorApi(m).budget.override).toBe(false);
  vi.setSystemTime(new Date("2026-11-09T13:00:00Z"));
  expect(api.budget).toMatchObject({
    used: 0,
    override: false,
    localPaused: false,
  });
});
it("honors a server 429 even when the local cap is overridden", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
  const api = new SectorApi(meter(), () => {}, fetcher);
  api.setBudgetOverride(true);
  await expect(api.request("/read", undefined, false)).rejects.toThrow(
    "rate limit",
  );
  expect(api.budget.serverPaused).toBe(true);
  await expect(api.request("/read", undefined, false)).rejects.toThrow(
    "cannot bypass",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("clears the override when the session is cleared and validates input", () => {
  const api = new SectorApi(meter());
  api.setBudgetOverride(true);
  api.clear();
  expect(api.budget.override).toBe(false);
  expect(() => api.setBudgetOverride("yes" as any)).toThrow("Invalid");
});
