import test from "node:test";
import assert from "node:assert/strict";
import { clampOpeningPosition, findNearestWallProjection, snapToGrid } from "../src/geometry/snap.js";
import type { WallModel } from "../src/model/models.js";

test("snapToGrid rounds to nearest grid intersection", () => {
  assert.deepEqual(snapToGrid({ x: 49, y: 51 }, 100), { x: 0, y: 100 });
  assert.deepEqual(snapToGrid({ x: 150, y: 250 }, 100), { x: 200, y: 300 });
});

test("findNearestWallProjection returns closest point and t", () => {
  const wall: WallModel = {
    id: "w",
    type: "wall",
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata: {},
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    thickness: 200,
    height: 2800,
    roomIds: []
  };

  const res = findNearestWallProjection({ x: 5, y: 5 }, [wall]);
  assert.ok(res);
  assert.equal(res.kind, "wall");
  assert.equal(res.wallId, "w");
  assert.ok(Math.abs((res.t ?? 0) - 0.5) < 1e-9);
  assert.ok(Math.abs(res.point.x - 5) < 1e-9);
  assert.ok(Math.abs(res.point.y - 0) < 1e-9);
  assert.ok(Math.abs(res.distance - 5) < 1e-9);
});

test("clampOpeningPosition respects half-width padding on wall", () => {
  const wall: WallModel = {
    id: "w",
    type: "wall",
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata: {},
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
    thickness: 200,
    height: 2800,
    roomIds: []
  };

  assert.equal(clampOpeningPosition(-1, wall, 200), 0.1);
  assert.equal(clampOpeningPosition(0.05, wall, 200), 0.1);
  assert.equal(clampOpeningPosition(0.5, wall, 200), 0.5);
  assert.equal(clampOpeningPosition(0.95, wall, 200), 0.9);
  assert.equal(clampOpeningPosition(2, wall, 200), 0.9);
});
