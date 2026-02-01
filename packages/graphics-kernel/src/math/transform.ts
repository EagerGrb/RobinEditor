import type { Point, Transform2D } from "./types.js";
import { nearlyEqual } from "./scalar.js";

export function identityTransform(): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function translationTransform(tx: number, ty: number): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaleTransform(sx: number, sy: number): Transform2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function multiplyTransform(a: Transform2D, b: Transform2D): Transform2D {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f
  };
}

export function invertTransform(m: Transform2D): Transform2D {
  const det = m.a * m.d - m.b * m.c;
  if (nearlyEqual(det, 0)) {
    throw new Error("Transform is not invertible");
  }

  const invDet = 1 / det;
  const a = m.d * invDet;
  const b = -m.b * invDet;
  const c = -m.c * invDet;
  const d = m.a * invDet;
  const e = -(a * m.e + c * m.f);
  const f = -(b * m.e + d * m.f);
  return { a, b, c, d, e, f };
}

export function applyTransformToPoint(m: Transform2D, p: Point): Point {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f
  };
}

