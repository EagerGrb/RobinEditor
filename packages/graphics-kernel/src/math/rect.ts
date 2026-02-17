import type { Point, Rect } from "./types.js";

export function rectFromPoints(p1: Point, p2: Point): Rect {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const width = Math.abs(p1.x - p2.x);
  const height = Math.abs(p1.y - p2.y);
  return { x, y, width, height };
}

export function rectUnion(r1: Rect, r2: Rect): Rect {
  const x = Math.min(r1.x, r2.x);
  const y = Math.min(r1.y, r2.y);
  const x2 = Math.max(r1.x + r1.width, r2.x + r2.width);
  const y2 = Math.max(r1.y + r1.height, r2.y + r2.height);
  return { x, y, width: x2 - x, height: y2 - y };
}

export function rectIntersects(r1: Rect, r2: Rect): boolean {
  return (
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y
  );
}
