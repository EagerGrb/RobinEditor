import type { Point } from "../math/types.js";

export function snapToGrid(p: Point, spacing: number): Point {
  if (spacing <= 0) return p;
  return {
    x: Math.round(p.x / spacing) * spacing,
    y: Math.round(p.y / spacing) * spacing
  };
}
