import type { Arc2, Curve2, Line2 } from "./curves.js";
import type { Vec2 } from "./vec2.js";

export function circleCurve(center: Vec2, radius: number): Arc2 {
  return { kind: "arc", c: { x: center.x, y: center.y }, r: radius, start: 0, delta: Math.PI * 2 };
}

export function rotatedRectLines(center: Vec2, w: number, h: number, rotationRad: number): Line2[] {
  const hw = w / 2;
  const hh = h / 2;
  const c = Math.cos(rotationRad);
  const s = Math.sin(rotationRad);

  const local = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ];

  const pts = local.map((p) => ({ x: center.x + p.x * c - p.y * s, y: center.y + p.x * s + p.y * c }));
  return [
    { kind: "line", a: pts[0]!, b: pts[1]! },
    { kind: "line", a: pts[1]!, b: pts[2]! },
    { kind: "line", a: pts[2]!, b: pts[3]! },
    { kind: "line", a: pts[3]!, b: pts[0]! }
  ];
}

export function capsuleBoundaryCurves(a: Vec2, b: Vec2, radius: number): Curve2[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len <= 1e-12) return [circleCurve(a, radius)];

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const p0L = { x: a.x + nx * radius, y: a.y + ny * radius };
  const p0R = { x: a.x - nx * radius, y: a.y - ny * radius };
  const p1L = { x: b.x + nx * radius, y: b.y + ny * radius };
  const p1R = { x: b.x - nx * radius, y: b.y - ny * radius };

  const theta = Math.atan2(uy, ux);
  const start1 = theta + Math.PI / 2;
  const start0 = theta - Math.PI / 2;

  const arc1: Arc2 = { kind: "arc", c: { x: b.x, y: b.y }, r: radius, start: start1, delta: -Math.PI };
  const arc0: Arc2 = { kind: "arc", c: { x: a.x, y: a.y }, r: radius, start: start0, delta: -Math.PI };

  return [
    { kind: "line", a: p0L, b: p1L },
    arc1,
    { kind: "line", a: p1R, b: p0R },
    arc0
  ];
}

export function capsuleFromCenter(center: Vec2, w: number, h: number, rotationRad: number): Curve2[] {
  const major = Math.max(w, h);
  const minor = Math.min(w, h);
  const r = minor / 2;
  const halfSeg = Math.max(0, (major - minor) / 2);
  const alongX = w >= h;
  const baseAngle = rotationRad + (alongX ? 0 : Math.PI / 2);
  const ax = Math.cos(baseAngle);
  const ay = Math.sin(baseAngle);
  const p0 = { x: center.x - ax * halfSeg, y: center.y - ay * halfSeg };
  const p1 = { x: center.x + ax * halfSeg, y: center.y + ay * halfSeg };
  return capsuleBoundaryCurves(p0, p1, r);
}

