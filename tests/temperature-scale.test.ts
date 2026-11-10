import { expect, test } from "vitest";
import {
  temperatureColor,
  temperatureRange,
  validTemperatureRange,
} from "../src/shared/temperature-scale";
test("temperature colors clamp extremes and reject missing readings", () => {
  const range = { min: 16, max: 28 };
  expect(temperatureColor(-10, range)).toBe(temperatureColor(16, range));
  expect(temperatureColor(99, range)).toBe(temperatureColor(28, range));
  expect(
    new Set([16, 19, 22, 25, 28].map((v) => temperatureColor(v, range))).size,
  ).toBe(5);
  expect(temperatureColor(undefined, range)).toBeUndefined();
  expect(temperatureColor(NaN, range)).toBeUndefined();
});
test("invalid and legacy ranges fall back safely", () => {
  for (const value of [
    undefined,
    null,
    { min: 20, max: 20 },
    { min: 28, max: 16 },
    { min: "16", max: 28 },
    { min: 16, max: Infinity },
  ]) {
    expect(validTemperatureRange(value)).toBe(false);
    expect(temperatureRange(value)).toEqual({ min: 16, max: 28 });
  }
});

test("scale uses blue, midpoint green, warm orange and hot red", () => {
  const range = { min: 16, max: 28 };
  expect(temperatureColor(16, range)).toBe("rgb(74,151,232)");
  expect(temperatureColor(22, range)).toBe("rgb(53,166,105)");
  expect(temperatureColor(25, range)).toBe("rgb(235,151,48)");
  expect(temperatureColor(28, range)).toBe("rgb(220,70,65)");
});
