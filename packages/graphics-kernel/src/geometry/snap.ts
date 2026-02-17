import type { Point } from "../math/types.js";

export function snapToGrid(p: Point, gridSize: number): Point {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return p;
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize
  };
}
