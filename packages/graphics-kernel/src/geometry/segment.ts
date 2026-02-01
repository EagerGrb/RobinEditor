import type { Point } from "../math/types.js";
import { clamp } from "../math/scalar.js";

export type PointToSegmentResult = {
  distance: number;
  t: number;
  closestPoint: Point;
};

export function pointToSegmentDistance(p: Point, a: Point, b: Point): PointToSegmentResult {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 0) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return { distance: Math.hypot(dx, dy), t: 0, closestPoint: { x: a.x, y: a.y } };
  }

  const tRaw = (apx * abx + apy * aby) / abLen2;
  const t = clamp(tRaw, 0, 1);
  const closestPoint = { x: a.x + abx * t, y: a.y + aby * t };
  const dx = p.x - closestPoint.x;
  const dy = p.y - closestPoint.y;
  return { distance: Math.hypot(dx, dy), t, closestPoint };
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

