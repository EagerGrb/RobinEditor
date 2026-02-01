import type { Point, Rect, Transform2D } from "../math/types.js";
import { rectFromPoints } from "../math/rect.js";

export type WallModel = {
  id: string;
  type: "wall";

  transform: Transform2D;
  boundingBox: Rect;
  metadata: Record<string, unknown>;

  start: Point;
  end: Point;
  thickness: number;
  height: number;
  roomIds: string[];
};

export type OpeningModel = {
  id: string;
  type: "opening";

  transform: Transform2D;
  boundingBox: Rect;
  metadata: Record<string, unknown>;

  openingKind: "door" | "window";
  wallId: string;
  position: number;
  width: number;
  height: number;
};

export type DimensionModel = {
  id: string;
  type: "dimension";

  transform: Transform2D;
  boundingBox: Rect;
  metadata: Record<string, unknown>;

  points: Point[];
  offset: number;
  precision: number;
};

export type GridModel = {
  id: string;
  type: "grid";

  transform: Transform2D;
  boundingBox: Rect;
  metadata: Record<string, unknown>;

  spacing: number;
  visible: boolean;
};

export type SceneModel = {
  version: number;
  walls: WallModel[];
  openings: OpeningModel[];
  dimensions: DimensionModel[];
  grid: GridModel;
};

export function computeWallBoundingBox(start: Point, end: Point, thickness: number): Rect {
  const half = Math.max(0, thickness) / 2;
  const minX = Math.min(start.x, end.x) - half;
  const minY = Math.min(start.y, end.y) - half;
  const maxX = Math.max(start.x, end.x) + half;
  const maxY = Math.max(start.y, end.y) + half;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function computeDimensionBoundingBox(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let r = rectFromPoints(points[0]!, points[0]!);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const pr = rectFromPoints(p, p);
    const x1 = Math.min(r.x, pr.x);
    const y1 = Math.min(r.y, pr.y);
    const x2 = Math.max(r.x + r.width, pr.x + pr.width);
    const y2 = Math.max(r.y + r.height, pr.y + pr.height);
    r = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  return r;
}
