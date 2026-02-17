import type { Point, Transform2D } from "./types.js";

export function identityTransform(): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function applyTransformToPoint(t: Transform2D, p: Point): Point {
  return {
    x: t.a * p.x + t.c * p.y + t.e,
    y: t.b * p.x + t.d * p.y + t.f
  };
}

export function invertTransform(t: Transform2D): Transform2D {
  const det = t.a * t.d - t.b * t.c;
  if (Math.abs(det) < 1e-6) return identityTransform();
  const invDet = 1 / det;
  return {
    a: t.d * invDet,
    b: -t.b * invDet,
    c: -t.c * invDet,
    d: t.a * invDet,
    e: (t.c * t.f - t.d * t.e) * invDet,
    f: (t.b * t.e - t.a * t.f) * invDet
  };
}
