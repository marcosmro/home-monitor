import type { MapPlan, PlanPoint } from "./house-map";
export type Vec3 = [number, number, number]; // X, vertical Y, plan depth Z; metres
export interface MeshFace {
  vertices: Vec3[];
  color: string;
  kind: string;
  /** Plan area a floor face belongs to, so the view can highlight a room. */
  areaId?: string;
}
export interface HouseMesh {
  faces: MeshFace[];
  labels: { text: string; point: Vec3 }[];
}

// Architectural wall paths use straight SVG commands only. Reject unsupported syntax.
export function wallSegments(path: string): [PlanPoint, PlanPoint][] {
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g) || [];
  const segments: [PlanPoint, PlanPoint][] = [];
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    i = 0,
    cmd = "";
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    const relative = cmd === cmd.toLowerCase(),
      c = cmd.toUpperCase();
    if (!["M", "L", "H", "V", "Z"].includes(c))
      throw new Error("Unsupported wall path command");
    if (c === "Z") {
      segments.push([
        [x, y],
        [sx, sy],
      ]);
      x = sx;
      y = sy;
      cmd = "";
      continue;
    }
    const n = Number(tokens[i++]);
    if (!Number.isFinite(n)) throw new Error("Invalid wall path");
    let nx = x,
      ny = y;
    if (c === "M" || c === "L") {
      const second = Number(tokens[i++]);
      if (!Number.isFinite(second)) throw new Error("Invalid wall path");
      nx = n + (relative ? x : 0);
      ny = second + (relative ? y : 0);
    }
    if (c === "H") nx = n + (relative ? x : 0);
    if (c === "V") ny = n + (relative ? y : 0);
    if (c !== "M")
      segments.push([
        [x, y],
        [nx, ny],
      ]);
    else {
      sx = nx;
      sy = ny;
      cmd = relative ? "l" : "L";
    }
    x = nx;
    y = ny;
  }
  return segments.filter(
    ([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01,
  );
}
export function inside(point: PlanPoint, polygon: PlanPoint[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, y] = polygon[i],
      [xx, yy] = polygon[j];
    if (
      y > point[1] !== yy > point[1] &&
      point[0] < ((xx - x) * (point[1] - y)) / (yy - y) + x
    )
      result = !result;
  }
  return result;
}
export function floorLevel(plan: MapPlan, point: PlanPoint) {
  const area = plan.drawing?.areas.find(
    (a) => a.kind !== "void" && inside(point, a.points),
  );
  return area ? plan.model?.areaLevels?.[area.id] || 0 : 0;
}
export function buildHouseMesh(
  plan: MapPlan,
  height = plan.model?.defaultHeight || 2.7,
  cutaway = false,
  includeRoof = false,
): HouseMesh {
  const mesh: HouseMesh = { faces: [], labels: [] };
  const drawing = plan.drawing;
  if (!drawing) return mesh;
  const scale = plan.model?.pixelsPerMetre || 44;
  const convert = (p: PlanPoint, z: number): Vec3 => [
    p[0] / scale,
    z,
    p[1] / scale,
  ];
  const face = (vertices: Vec3[], color: string, kind: string) =>
    mesh.faces.push({ vertices, color, kind });
  const prism = (
    a: PlanPoint,
    b: PlanPoint,
    base: number,
    top: number | [number, number],
    color: string,
    kind: string,
    thickness = 0.12,
  ) => {
    const tops = (typeof top === "number" ? [top, top] : top).map((value) =>
      Math.max(base, value),
    );
    if (Math.max(...tops) <= base) return;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) return;
    const dx = ((-(b[1] - a[1]) / len) * thickness * scale) / 2,
      dy = (((b[0] - a[0]) / len) * thickness * scale) / 2;
    const pts: PlanPoint[] = [
      [a[0] + dx, a[1] + dy],
      [b[0] + dx, b[1] + dy],
      [b[0] - dx, b[1] - dy],
      [a[0] - dx, a[1] - dy],
    ];
    face(
      pts.map((p, i) => convert(p, tops[i === 0 || i === 3 ? 0 : 1])),
      color,
      kind,
    );
    for (let i = 0; i < 4; i++) {
      const p = pts[i],
        q = pts[(i + 1) % 4];
      face(
        [
          convert(p, base),
          convert(q, base),
          convert(q, tops[(i + 1) % 4 === 0 || (i + 1) % 4 === 3 ? 0 : 1]),
          convert(p, tops[i === 0 || i === 3 ? 0 : 1]),
        ],
        i % 2 ? "#c4cec5" : color,
        kind,
      );
    }
  };
  const modelPoint = (p: Vec3): Vec3 => [p[0] / scale, p[1], p[2] / scale];
  const beam = (
    a: Vec3,
    b: Vec3,
    width: number,
    color: string,
    kind: string,
  ) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2],
      len = Math.hypot(dx, dy, dz);
    if (len < 0.0001) return;
    const horizontal = Math.hypot(dx, dz);
    const u: Vec3 =
      horizontal < 0.0001
        ? [width / 2, 0, 0]
        : [
            ((-dz / horizontal) * width) / 2,
            0,
            ((dx / horizontal) * width) / 2,
          ];
    const v: Vec3 = [
      (dy * u[2] - dz * u[1]) / len,
      (dz * u[0] - dx * u[2]) / len,
      (dx * u[1] - dy * u[0]) / len,
    ];
    const corners = (p: Vec3): Vec3[] =>
      [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ].map(([s, t]) => [
        p[0] + s * u[0] + t * v[0],
        p[1] + s * u[1] + t * v[1],
        p[2] + s * u[2] + t * v[2],
      ]);
    const aa = corners(a),
      bb = corners(b);
    face(aa, color, kind);
    face(bb, color, kind);
    for (let i = 0; i < 4; i++)
      face([aa[i], aa[(i + 1) % 4], bb[(i + 1) % 4], bb[i]], color, kind);
  };
  for (const area of drawing.areas) {
    if (plan.model?.scene === "exterior" && area.label) {
      mesh.labels.push({
        text: area.label,
        point: convert(area.labelAt, plan.model.areaLevels?.[area.id] || 0),
      });
    }
    if (area.kind === "void" || plan.model?.excludedAreas?.includes(area.id))
      continue;
    const z = plan.model?.areaLevels?.[area.id] || 0;
    face(
      area.points.map((p) => convert(p, z)),
      "#f6f7f5",
      "floor",
    );
    mesh.faces[mesh.faces.length - 1].areaId = area.id;
    for (let i = 0; i < area.points.length; i++) {
      const a = area.points[i],
        b = area.points[(i + 1) % area.points.length];
      face(
        [
          convert(a, z - 0.12),
          convert(b, z - 0.12),
          convert(b, z),
          convert(a, z),
        ],
        "#abb9ad",
        "slab",
      );
    }
    if (area.label && plan.model?.scene !== "exterior")
      mesh.labels.push({
        text: area.label.replaceAll("|", " "),
        point: convert(area.labelAt, z + 0.03),
      });
  }
  for (const [a, b] of drawing.walls.flatMap(wallSegments)) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const at = (t: number): PlanPoint => [a[0] + t * dx, a[1] + t * dy];
    const projection = (p: PlanPoint) =>
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length);
    const distance = (p: PlanPoint) =>
      Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
    const ops = drawing.openings
      .filter((o) => distance(o.a) < 2 && distance(o.b) < 2)
      .map((o) => ({
        o,
        start: Math.max(0, Math.min(projection(o.a), projection(o.b))),
        end: Math.min(1, Math.max(projection(o.a), projection(o.b))),
      }))
      .filter((o) => o.end > o.start);
    const stops = [
      ...new Set([
        0,
        1,
        ...ops.flatMap((o) => [o.start, o.end]),
        ...drawing.areas
          .flatMap((area) => area.points)
          .filter((p) => distance(p) < 2)
          .map(projection)
          .filter((t) => t > 0 && t < 1),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < stops.length - 1; i++) {
      const lo = stops[i],
        hi = stops[i + 1],
        mid = (lo + hi) / 2,
        p = at(lo),
        q = at(hi);
      const normal: PlanPoint = [(-dy / length) * 3, (dx / length) * 3],
        m = at(mid);
      const base = Math.max(
        floorLevel(plan, [m[0] + normal[0], m[1] + normal[1]]),
        floorLevel(plan, [m[0] - normal[0], m[1] - normal[1]]),
      );
      const adjacent = drawing.areas.filter(
        (area) =>
          area.kind !== "void" &&
          [1, -1].some((sign) =>
            inside(
              [m[0] + sign * normal[0], m[1] + sign * normal[1]],
              area.points,
            ),
          ),
      );
      const wallTop = (point: PlanPoint) =>
        adjacent.length
          ? Math.max(
              ...adjacent.map((area) => {
                const profile = plan.model?.ceilingProfiles?.find(
                  (c) => c.areaId === area.id,
                );
                const offset = plan.model?.areaLevels?.[area.id] || 0;
                if (profile) {
                  const t = Math.max(
                    0,
                    Math.min(
                      1,
                      ((profile.axis === "x" ? point[0] : point[1]) -
                        profile.start) /
                        (profile.end - profile.start),
                    ),
                  );
                  return (
                    offset + profile.low + t * (profile.high - profile.low)
                  );
                }
                return offset + (plan.model?.areaHeights?.[area.id] || height);
              }),
            )
          : base + height;
      const top: [number, number] = cutaway
        ? [base + Math.min(height, 0.85), base + Math.min(height, 0.85)]
        : [wallTop(p), wallTop(q)];
      const openings = ops
        .filter((o) => mid >= o.start && mid <= o.end)
        .map(({ o }) => ({
          opening: o,
          sill: o.sill ?? (o.kind === "window" ? 0.9 : 0),
          head: Math.min(height, o.head ?? 2.15),
        }))
        .sort((a, b) => a.sill - b.sill);
      if (!openings.length) prism(p, q, base, top, "#e7eee6", "wall");
      else {
        let cursor = base;
        for (const { opening, sill, head } of openings) {
          prism(p, q, cursor, Math.min(...top, base + sill), "#e7eee6", "wall");
          cursor = Math.max(cursor, base + head);
          if (
            opening.kind !== "door" &&
            opening.kind !== "garage-door" &&
            !cutaway
          ) {
            face(
              [
                convert(p, base + sill),
                convert(q, base + sill),
                convert(q, base + head),
                convert(p, base + head),
              ],
              "#9dc9d5",
              "glazing",
            );
            beam(
              convert(p, base + sill),
              convert(q, base + sill),
              0.045,
              "#394b49",
              "frame",
            );
            beam(
              convert(p, base + head),
              convert(q, base + head),
              0.045,
              "#394b49",
              "frame",
            );
            const panes = Math.max(1, Math.min(8, opening.panes || 1));
            for (let k = 0; k <= panes; k++) {
              const at: PlanPoint = [
                p[0] + ((q[0] - p[0]) * k) / panes,
                p[1] + ((q[1] - p[1]) * k) / panes,
              ];
              beam(
                convert(at, base + sill),
                convert(at, base + head),
                0.045,
                "#394b49",
                "frame",
              );
            }
          }
        }
        prism(p, q, cursor, top, "#e7eee6", "wall");
      }
    }
  }
  for (const stair of plan.model?.stairs || []) {
    for (let n = 0; n < stair.steps; n++) {
      const z = stair.from + ((stair.to - stair.from) * (n + 1)) / stair.steps;
      prism(
        [stair.x, stair.y + (stair.depth * (n + 0.5)) / stair.steps],
        [
          stair.x + stair.width,
          stair.y + (stair.depth * (n + 0.5)) / stair.steps,
        ],
        Math.min(stair.from, z - 0.1),
        z,
        "#bc9870",
        "stairs",
        Math.abs(stair.depth / stair.steps / scale),
      );
    }
  }
  for (const item of plan.model?.fixtures || [])
    prism(
      [item.x, item.y + item.depth / 2],
      [item.x + item.width, item.y + item.depth / 2],
      item.base,
      item.base + item.height,
      item.color,
      "fixture",
      item.depth / scale,
    );
  for (const rail of plan.model?.rails || []) {
    const a = modelPoint(rail.a),
      b = modelPoint(rail.b),
      length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const topA: Vec3 = [a[0], a[1] + rail.height, a[2]],
      topB: Vec3 = [b[0], b[1] + rail.height, b[2]];
    beam(topA, topB, 0.035, "#82928c", "railing");
    if (rail.style === "glass") face([a, b, topB, topA], "#b3d5d8", "glazing");
    else
      for (let k = 1; k <= 4; k++)
        beam(
          [a[0], a[1] + (rail.height * k) / 5, a[2]],
          [b[0], b[1] + (rail.height * k) / 5, b[2]],
          0.013,
          "#8c9b95",
          "railing",
        );
    const count = Math.max(1, Math.ceil(length / 1.3));
    for (let k = 0; k <= count; k++) {
      const t = k / count,
        p: Vec3 = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
      beam(p, [p[0], p[1] + rail.height, p[2]], 0.03, "#82928c", "railing");
    }
  }
  for (const post of plan.model?.posts || []) {
    const p = convert(post.point, post.base),
      q = convert(post.point, post.top);
    beam(p, q, post.width, post.color, "support");
  }
  for (const surface of plan.model?.surfaces || []) {
    if ((surface.kind === "roof" || surface.kind === "ceiling") && !includeRoof)
      continue;
    face(
      surface.points.map(modelPoint),
      surface.color,
      surface.kind === "glass" ? "glazing" : surface.kind,
    );
  }
  return mesh;
}
export function meshToObj(mesh: HouseMesh) {
  let result =
    "# Home Monitor architectural draft. Metres; Y up. Heights are assumptions, not surveyed.\n";
  let offset = 1;
  for (const f of mesh.faces.flatMap((face) =>
    triangulate(face.vertices).map((vertices) => ({ ...face, vertices })),
  )) {
    result +=
      `g ${f.kind}\n` +
      f.vertices
        .map((v) => `v ${v.map((n) => n.toFixed(5)).join(" ")}`)
        .join("\n") +
      "\n";
    result += `f ${f.vertices.map((_, i) => offset + i).join(" ")}\n`;
    offset += f.vertices.length;
  }
  return result;
}

/** Ear clipping preserves concave room outlines instead of filling recesses. */
export function triangulate(vertices: Vec3[]): Vec3[][] {
  if (vertices.length <= 3) return vertices.length === 3 ? [vertices] : [];
  const normal = [0, 0, 0];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const points = vertices.map((v) => v.filter((_, i) => i !== drop));
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const area = points.reduce(
    (s, p, i) =>
      s +
      p[0] * points[(i + 1) % points.length][1] -
      points[(i + 1) % points.length][0] * p[1],
    0,
  );
  if (Math.abs(area) < 1e-10) return [];
  const sign = Math.sign(area),
    ids = vertices.map((_, i) => i),
    out: Vec3[][] = [];
  while (ids.length > 3) {
    let found = false;
    for (let j = 0; j < ids.length; j++) {
      const a = ids[(j + ids.length - 1) % ids.length],
        b = ids[j],
        c = ids[(j + 1) % ids.length];
      const turn = cross(points[a], points[b], points[c]) * sign;
      if (Math.abs(turn) < 1e-10) {
        ids.splice(j, 1);
        found = true;
        break;
      }
      if (turn < 0) continue;
      if (
        ids.some(
          (k) =>
            k !== a &&
            k !== b &&
            k !== c &&
            cross(points[a], points[b], points[k]) * sign >= -1e-10 &&
            cross(points[b], points[c], points[k]) * sign >= -1e-10 &&
            cross(points[c], points[a], points[k]) * sign >= -1e-10,
        )
      )
        continue;
      out.push([vertices[a], vertices[b], vertices[c]]);
      ids.splice(j, 1);
      found = true;
      break;
    }
    if (!found) throw new Error("Invalid non-simple model surface");
  }
  if (ids.length === 3) out.push(ids.map((i) => vertices[i]));
  return out;
}
