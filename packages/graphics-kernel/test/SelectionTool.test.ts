import test from "node:test";
import assert from "node:assert/strict";
import { SelectionTool } from "../src/tools/SelectionTool.js";
import type { ToolContext } from "../src/tools/Tool.js";

function createCtx(overrides?: Partial<ToolContext>): ToolContext {
  let hoverId: string | null = null;
  let marqueeRect: any = null;
  const selectedIds = new Set<string>();

  const ctx: ToolContext = {
    getSelectionState: () => ({ selectedIds, hoverId, marqueeRect }),
    setHover: (id) => {
      hoverId = id;
    },
    setSelection: (ids, mode) => {
      if (mode === "replace") {
        selectedIds.clear();
        for (const id of ids) selectedIds.add(id);
      } else if (mode === "toggle") {
        for (const id of ids) {
          if (selectedIds.has(id)) selectedIds.delete(id);
          else selectedIds.add(id);
        }
      } else {
        for (const id of ids) selectedIds.add(id);
      }
    },
    setMarqueeRect: (rect) => {
      marqueeRect = rect;
    },

    snapPoint: () => {
      throw new Error("snapPoint not used in SelectionTool tests");
    },
    hitTest: () => null,
    hitTestRect: () => [],

    translateSelected: () => {},
    deleteSelection: () => {},

    addWallPolyline: () => {
      throw new Error("addWallPolyline not used in SelectionTool tests");
    },
    addOpeningAt: () => {
      throw new Error("addOpeningAt not used in SelectionTool tests");
    },
    addDimension: () => {
      throw new Error("addDimension not used in SelectionTool tests");
    },
    setEphemeralDrawCommands: () => {}
  };

  return { ...ctx, ...overrides };
}

test("SelectionTool drags selected shape by pointer delta", () => {
  const tool = new SelectionTool();
  const deltas: Array<{ x: number; y: number }> = [];
  const ctx = createCtx({
    hitTest: () => "wall_1",
    translateSelected: (delta) => deltas.push(delta)
  });

  tool.onPointerEvent(
    {
      type: "pointerdown",
      pointerId: 1,
      buttons: 1,
      worldPosition: { x: 10, y: 10 },
      screenPosition: { x: 10, y: 10 },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
      timestamp: 1
    },
    ctx,
  );

  tool.onPointerEvent(
    {
      type: "pointermove",
      pointerId: 1,
      buttons: 1,
      worldPosition: { x: 25, y: 40 },
      screenPosition: { x: 25, y: 40 },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
      timestamp: 2
    },
    ctx,
  );

  tool.onPointerEvent(
    {
      type: "pointermove",
      pointerId: 1,
      buttons: 1,
      worldPosition: { x: 20, y: 30 },
      screenPosition: { x: 20, y: 30 },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
      timestamp: 3
    },
    ctx,
  );

  assert.deepEqual(deltas, [
    { x: 15, y: 30 },
    { x: -5, y: -10 }
  ]);
});

test("SelectionTool deletes selection on Delete key", () => {
  const tool = new SelectionTool();
  let deleteCalls = 0;
  const ctx = createCtx({
    deleteSelection: () => {
      deleteCalls++;
    }
  });

  tool.onKeyDown(
    {
      key: "Delete",
      modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
      timestamp: 1
    },
    ctx,
  );

  assert.equal(deleteCalls, 1);
});

