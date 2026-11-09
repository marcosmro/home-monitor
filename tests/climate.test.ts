import { describe, it, expect } from "vitest";
import {
  averageTemperature,
  climatePlan,
  finiteTemperature,
  roomKey,
  roomGroupKey,
} from "../src/shared/climate";
import { demoSnapshot } from "../src/shared/demo";
import { defaults } from "../src/shared/model";

describe("temperature summaries", () => {
  it("preserves zero and negative readings, rejecting missing and invalid values", () => {
    expect([0, -5, "0", "21.5"].map(finiteTemperature)).toEqual([
      0, -5, 0, 21.5,
    ]);
    for (const value of [null, undefined, "", " ", NaN, Infinity, false])
      expect(finiteTemperature(value)).toBeUndefined();
  });
  it("retains house and room API averages including zero", () => {
    const meta = climatePlan(
      {
        averageTemperature: "21.4",
        areas: [
          {
            sections: [
              { id: "f", places: [{ id: "r", averageTemperature: 0 }] },
            ],
          },
        ],
      },
      new Date().toISOString(),
    );
    expect(meta.houseAverage).toBe(21.4);
    expect(meta.roomAverages[roomKey({ floorId: "f", roomId: "r" })]).toBe(0);
  });
  it("weights physical readings equally, deduplicates, and excludes unavailable sensors", () => {
    const s = demoSnapshot();
    const base = s.devices[0];
    const ds = [0, 10, 20].map((temperature, i) => ({
      ...base,
      id: String(i),
      temperature,
      roomId: i ? "b" : "a",
    }));
    ds.push(
      { ...ds[0] },
      { ...base, id: "offline", temperature: 100, offline: true },
    );
    expect(averageTemperature(s, ds)).toMatchObject({
      value: 10,
      used: 3,
      total: 4,
    });
  });
  it("uses fresh server averages and falls back when their inputs are unavailable", () => {
    const s = demoSnapshot();
    const d = { ...s.devices[0], temperature: 20 };
    s.climate = { fetchedAt: d.fetchedAt, houseAverage: 22, roomAverages: {} };
    expect(averageTemperature(s, [d])).toMatchObject({
      value: 22,
      source: "api",
    });
    expect(
      averageTemperature(s, [
        d,
        { ...d, id: "other", temperature: 30, offline: true },
      ]),
    ).toMatchObject({ value: 20, source: "calculated" });
    s.warnings.telemetry = "Unavailable";
    expect(averageTemperature(s, [d]).value).toBeUndefined();
  });
  it("uses temperature fetch time independently from contact freshness", () => {
    const s = demoSnapshot();
    const d = {
      ...s.devices[0],
      temperature: 0,
      fetchedAt: "2020-01-01T00:00:00Z",
      temperatureFetchedAt: new Date().toISOString(),
    };
    expect(averageTemperature(s, [d]).value).toBe(0);
    d.temperatureFetchedAt = d.fetchedAt;
    expect(averageTemperature(s, [d]).value).toBeUndefined();
  });
  it("keeps identically named rooms with distinct IDs separate", () => {
    const s = demoSnapshot(),
      d = s.devices[0];
    expect(roomGroupKey(d, defaults)).not.toBe(
      roomGroupKey({ ...d, roomId: "different" }, defaults),
    );
  });
});
