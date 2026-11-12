/** Items in a saved order; anything the order does not name keeps its place after. */
export function inOrder<T>(
  items: T[],
  key: (item: T) => string,
  order: string[] = [],
) {
  const rank = new Map(order.map((k, i) => [k, i]));
  return items
    .map((item, i) => ({ item, i, rank: rank.get(key(item)) ?? Infinity }))
    .sort((a, b) => (a.rank === b.rank ? a.i - b.i : a.rank - b.rank))
    .map((entry) => entry.item);
}
/** The full key list with `key` moved to sit just before or after `neighbor`. */
export function moveBeside(
  keys: string[],
  key: string,
  neighbor: string,
  after: boolean,
) {
  const rest = keys.filter((k) => k !== key);
  rest.splice(rest.indexOf(neighbor) + (after ? 1 : 0), 0, key);
  return rest;
}
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
/**
 * Sensors of one type side by side, each type sorted by name with numbers in
 * numeric order (Ventana 2 before Ventana 10). Types keep first-seen order.
 */
export function sortSensors<T extends { type: string }>(
  devices: T[],
  name: (device: T) => string,
) {
  const types = [...new Set(devices.map((d) => d.type))];
  return [...devices].sort(
    (a, b) =>
      types.indexOf(a.type) - types.indexOf(b.type) ||
      collator.compare(name(a), name(b)),
  );
}
