import { demoSnapshot } from "./demo";
import type { MapProject, MapPlan } from "./house-map";
export function demoMap(): MapProject {
  const ds = demoSnapshot().devices;
  const plans: MapPlan[] = [
    ...new Map(
      ds.map((d) => [
        d.floorId,
        { id: d.floorId, label: d.floorEs || d.floor, width: 800, height: 600 },
      ]),
    ).values(),
  ];
  const rooms = [...new Map(ds.map((d) => [d.roomId, d])).values()].map(
    (d, i) => {
      const x = 0.27 + (i % 2) * 0.46,
        y = 0.27 + (Math.floor(i / 2) % 2) * 0.46;
      return {
        id: d.roomId,
        planId: d.floorId,
        label: d.roomEs || d.room,
        center: [x, y] as [number, number],
        windows: [
          [x - 0.15, y - 0.15],
          [x + 0.15, y - 0.15],
        ] as [number, number][],
        doors: [[x, y + 0.15]] as [number, number][],
        matches: [
          {
            room: [d.room, d.roomEs || d.room],
            floor: [d.floor, d.floorEs || d.floor],
          },
        ],
      };
    },
  );
  for (const plan of plans) {
    const rs = rooms.filter((r) => r.planId === plan.id);
    plan.drawing = {
      bounds: [0, 0, 800, 600],
      areas: rs.map((r) => {
        const x = r.center[0] * 800,
          y = r.center[1] * 600;
        return {
          id: r.id,
          label: r.label,
          // Above the suggested sensor positions, which cluster at the room centre.
          labelAt: [x, y - 60],
          points: [
            [x - 160, y - 110],
            [x + 160, y - 110],
            [x + 160, y + 110],
            [x - 160, y + 110],
          ],
        };
      }),
      walls: rs.map(
        (r) =>
          `M${r.center[0] * 800 - 160},${r.center[1] * 600 - 110} h320 v220 h-320 Z`,
      ),
      openings: rs.flatMap((r, i) => {
        const x = r.center[0] * 800,
          y = r.center[1] * 600;
        return [
          {
            id: `V${i + 1}`,
            roomId: r.id,
            kind: "window" as const,
            a: [x - 60, y - 110] as [number, number],
            b: [x + 60, y - 110] as [number, number],
          },
          {
            id: `P${i + 1}`,
            roomId: r.id,
            kind: "door" as const,
            a: [x - 25, y + 110] as [number, number],
            b: [x + 25, y + 110] as [number, number],
            swing: `M${x - 25},${y + 110} v-50 a50,50 0 0 1 50,50`,
          },
        ];
      }),
      details: [],
    };
  }
  return { plans, rooms };
}
export function demoMapImage(id: string) {
  const rooms = demoMap().rooms.filter((r) => r.planId === id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#fafbf8"/><text x="28" y="27" font-family="sans-serif" font-size="13" fill="#68786f">DEMO FLOOR PLAN</text>${rooms.map((r) => `<rect x="${r.center[0] * 800 - 160}" y="${r.center[1] * 600 - 110}" width="320" height="220" fill="white" stroke="#7b8b82" stroke-width="5"/><text x="${r.center[0] * 800}" y="${r.center[1] * 600 + 45}" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#68786f">${r.label}</text>`).join("")}</svg>`;
  return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
}
