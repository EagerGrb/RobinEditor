import type { Point } from "../math/types.js";
import { clamp } from "../math/scalar.js";
import { pointToSegmentDistance, segmentLength } from "./segment.js";
import type { WallModel } from "../model/models.js";

export type SnapCandidate = {
  kind: "grid" | "endpoint" | "wall";
  point: Point;
  distance: number;
  wallId?: string;
  t?: number;
};

export function snapToGrid(p: Point, spacing: number): Point {
  if (spacing <= 0) return p;
  return {
    x: Math.round(p.x / spacing) * spacing,
    y: Math.round(p.y / spacing) * spacing
  };
}

export function findNearestEndpoint(p: Point, endpoints: Array<{ point: Point; wallId: string }>): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  for (const e of endpoints) {
    const dx = p.x - e.point.x;
    const dy = p.y - e.point.y;
    const dist = Math.hypot(dx, dy);
    if (!best || dist < best.distance) {
      best = { kind: "endpoint", point: e.point, distance: dist, wallId: e.wallId };
    }
  }
  return best;
}

export function findNearestWallProjection(p: Point, walls: WallModel[]): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  for (const wall of walls) {
    const res = pointToSegmentDistance(p, wall.start, wall.end);
    if (!best || res.distance < best.distance) {
      best = {
        kind: "wall",
        point: res.closestPoint,
        distance: res.distance,
        wallId: wall.id,
        t: res.t
      };
    }
  }
  return best;
}

export function clampOpeningPosition(position: number, wall: WallModel, openingWidth: number): number {
  const len = segmentLength(wall.start, wall.end);
  if (len <= 0) return 0;
  const halfT = (openingWidth / 2) / len;
  return clamp(position, halfT, 1 - halfT);
}

