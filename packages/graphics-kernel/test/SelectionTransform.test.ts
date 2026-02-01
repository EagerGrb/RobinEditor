import test from "node:test";
import assert from "node:assert/strict";
import { GraphicsKernel } from "../src/kernel/GraphicsKernel.js";
import { computeWallBoundingBox } from "../src/model/models.js";
import type { SceneModel, WallModel } from "../src/model/models.js";

function baseScene(walls: WallModel[]): SceneModel {
  return {
    version: 1,
    walls,
    openings: [],
    dimensions: [],
    grid: {
      id: "grid",
      type: "grid",
      transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      metadata: {},
      spacing: 100,
      visible: true
    }
  };
}

function selectAt(kernel: GraphicsKernel, x: number, y: number): void {
  kernel.handlePointerEvent({
    type: "pointerdown",
    pointerId: 1,
    buttons: 1,
    worldPosition: { x, y },
    screenPosition: { x, y },
    modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
    timestamp: 1
  });
  kernel.handlePointerEvent({
    type: "pointerup",
    pointerId: 1,
    buttons: 0,
    worldPosition: { x, y },
    screenPosition: { x, y },
    modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
    timestamp: 2
  });
}

test("Selection transform translates selected wall in world space", () => {
  const kernel = new GraphicsKernel();
  const wall: WallModel = {
    id: "wall_1",
    type: "wall",
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    boundingBox: computeWallBoundingBox({ x: 0, y: 0 }, { x: 10, y: 0 }, 200),
    metadata: {},
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    thickness: 200,
    height: 2800,
    roomIds: []
  };
  kernel.load(baseScene([wall]));
  selectAt(kernel, 0, 0);

  kernel.beginSelectionTransform(1);
  kernel.updateSelectionTransform({ type: "translate", delta: { x: 5, y: -3 } });
  kernel.endSelectionTransform(1);

  const saved = kernel.save();
  const updated = saved.walls.find((w) => w.id === "wall_1");
  assert.ok(updated);
  assert.deepEqual(updated.start, { x: 5, y: -3 });
  assert.deepEqual(updated.end, { x: 15, y: -3 });
});

test("Selection transform rotates selected wall around explicit pivot", () => {
  const kernel = new GraphicsKernel();
  const wall: WallModel = {
    id: "wall_1",
    type: "wall",
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    boundingBox: computeWallBoundingBox({ x: 1, y: 0 }, { x: 3, y: 0 }, 20),
    metadata: {},
    start: { x: 1, y: 0 },
    end: { x: 3, y: 0 },
    thickness: 20,
    height: 2800,
    roomIds: []
  };
  kernel.load(baseScene([wall]));
  selectAt(kernel, 2, 0);

  kernel.beginSelectionTransform(1);
  kernel.updateSelectionTransform({ type: "rotate", angleRad: Math.PI / 2, pivot: { x: 0, y: 0 } });
  kernel.endSelectionTransform(1);

  const saved = kernel.save();
  const updated = saved.walls.find((w) => w.id === "wall_1");
  assert.ok(updated);
  assert.ok(Math.abs(updated.start.x - 0) < 1e-9);
  assert.ok(Math.abs(updated.start.y - 1) < 1e-9);
  assert.ok(Math.abs(updated.end.x - 0) < 1e-9);
  assert.ok(Math.abs(updated.end.y - 3) < 1e-9);
});

test("Selection transform scales selected wall around explicit pivot", () => {
  const kernel = new GraphicsKernel();
  const wall: WallModel = {
    id: "wall_1",
    type: "wall",
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    boundingBox: computeWallBoundingBox({ x: 1, y: 0 }, { x: 3, y: 0 }, 20),
    metadata: {},
    start: { x: 1, y: 0 },
    end: { x: 3, y: 0 },
    thickness: 20,
    height: 2800,
    roomIds: []
  };
  kernel.load(baseScene([wall]));
  selectAt(kernel, 2, 0);

  kernel.beginSelectionTransform(1);
  kernel.updateSelectionTransform({ type: "scale", scaleX: 2, scaleY: 2, pivot: { x: 2, y: 0 } });
  kernel.endSelectionTransform(1);

  const saved = kernel.save();
  const updated = saved.walls.find((w) => w.id === "wall_1");
  assert.ok(updated);
  assert.ok(Math.abs(updated.start.x - 0) < 1e-9);
  assert.ok(Math.abs(updated.end.x - 4) < 1e-9);
});
