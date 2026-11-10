export interface TemperatureRange {
  min: number;
  max: number;
}
export const defaultTemperatureRange: TemperatureRange = { min: 16, max: 28 };
export function validTemperatureRange(
  value: unknown,
): value is TemperatureRange {
  if (!value || typeof value !== "object") return false;
  const { min, max } = value as TemperatureRange;
  return (
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= -50 &&
    max <= 80 &&
    max - min >= 1
  );
}
export function temperatureRange(value: unknown): TemperatureRange {
  return validTemperatureRange(value) ? value : defaultTemperatureRange;
}
const stops = [
  { at: 0, color: [74, 151, 232] },
  { at: 0.5, color: [53, 166, 105] },
  { at: 0.75, color: [235, 151, 48] },
  { at: 1, color: [220, 70, 65] },
];
export const temperatureGradient = `linear-gradient(90deg, ${stops.map(({ at, color }) => `rgb(${color.join(",")}) ${at * 100}%`).join(", ")})`;
export function temperatureColor(
  value: number | undefined,
  range: TemperatureRange,
): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const { min, max } = temperatureRange(range);
  const position = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const end = stops.findIndex(
    (stop, index) => index > 0 && position <= stop.at,
  );
  const start = stops[end - 1],
    finish = stops[end];
  const fraction = (position - start.at) / (finish.at - start.at);
  return `rgb(${start.color.map((v, i) => Math.round(v + (finish.color[i] - v) * fraction)).join(",")})`;
}
