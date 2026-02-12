import { Topics, type EventBus } from "@render/event-bus";
import type {
  GraphicsKernelEvent,
  IGraphicsKernel,
  InputKeyEvent,
  InputPointerEvent,
  SelectionTransform,
  SetToolParams
} from "@render/graphics-kernel";
import type { Rect, Transform2D } from "@render/rendering-core";

export class GraphicsMediator {
  private unsubscribes: Array<() => void> = [];
  private spacePressed = false;
  private viewportPanActive = false;
  private boxSelectionActive = false;
  private ignoreNextMouseUpAt: number | null = null;
  private pendingDirtyRects: Rect[] = [];
  private lastViewport: { scale: number; offsetX: number; offsetY: number } | null = null;
  private lastViewTransform: Transform2D | null = null;
  private lastSelectionSetEmitted: { idsKey: string; boundsKey: string } | null = null;
  private pendingMove: {
    x: number;
    y: number;
    buttons: number;
    modifiers: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
    timestamp: number;
  } | null = null;
  private moveRafId: number | null = null;

  private transformDrag:
    | {
        active: boolean;
        handleType: string;
        startScreen: { x: number; y: number };
        pivotWorld: { x: number; y: number };
      }
    | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly kernel: IGraphicsKernel,
  ) {}

  attach() {
    this.kernel.setWorldToScreenTransform({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

    this.unsubscribes.push(
      this.bus.subscribe(Topics.UI_COMMAND, (payload) => {
        if (payload.command === "EDIT.UNDO") {
          this.kernel.undo();
          return;
        }
        if (payload.command === "EDIT.REDO") {
          this.kernel.redo();
          return;
        }
        if (payload.command === "VIEW.ZOOM_RESET") {
          this.kernel.resetViewport();
          return;
        }
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.UI_TOOL_CHANGED, (payload) => {
        this.kernel.setTool(this.mapTool(payload.tool));
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.UI_OBJECT_PROPERTIES_CHANGED, (payload) => {
        this.kernel.setObjectProperties(payload.id, payload.patch);
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_TRANSFORM_HANDLE_START, (payload) => {
        const view = this.lastViewTransform;
        if (!view) return;
        const startScreen = { x: payload.x, y: payload.y };
        const bounds = this.kernel.getSelectionBounds();
        if (!bounds) return;
        const pivotWorld = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

        this.kernel.beginSelectionTransform(1);
        this.transformDrag = {
          active: true,
          handleType: payload.handleType,
          startScreen,
          pivotWorld
        };
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_TRANSFORM_HANDLE_DRAG, (payload) => {
        const state = this.transformDrag;
        const view = this.lastViewTransform;
        if (!state || !state.active || !view) return;
        const inv = invertTransform2D(view);
        const startWorld = applyTransform2D(inv, state.startScreen);
        const currentScreen = { x: payload.x, y: payload.y };
        const currentWorld = applyTransform2D(inv, currentScreen);

        const t = this.mapHandleDragToTransform(state.handleType, startWorld, currentWorld, state.pivotWorld);
        if (!t) return;
        this.kernel.updateSelectionTransform(t);
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_TRANSFORM_HANDLE_END, () => {
        if (this.transformDrag?.active) {
          this.kernel.endSelectionTransform(1);
        }
        this.transformDrag = null;
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_MOUSE_DOWN, (payload) => {
        if (payload.button === 2) return;
        this.kernel.handlePointerEvent(
          this.toPointerEvent("pointerdown", {
            x: payload.x,
            y: payload.y,
            buttons: payload.buttons,
            pointerId: payload.pointerId,
            modifiers: payload.modifiers,
            timestamp: payload.timestamp
          }),
        );
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_MOUSE_MOVE, (payload) => {
        if ((payload.buttons & 2) === 2) return;
        if (this.boxSelectionActive) return;
        this.pendingMove = {
          x: payload.x,
          y: payload.y,
          buttons: payload.buttons,
          modifiers: payload.modifiers,
          timestamp: payload.timestamp
        };

        if (this.moveRafId != null) return;
        this.moveRafId = safeRequestAnimationFrame(() => {
          this.moveRafId = null;
          const next = this.pendingMove;
          this.pendingMove = null;
          if (!next) return;
          if (this.boxSelectionActive) return;
          this.kernel.handlePointerEvent(
            this.toPointerEvent("pointermove", {
              x: next.x,
              y: next.y,
              buttons: next.buttons,
              pointerId: payload.pointerId,
              modifiers: next.modifiers,
              timestamp: next.timestamp
            }),
          );
        });
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_MOUSE_UP, (payload) => {
        if (this.ignoreNextMouseUpAt != null && payload.timestamp === this.ignoreNextMouseUpAt) {
          this.ignoreNextMouseUpAt = null;
          return;
        }
        if (payload.button === 2) return;
        if (this.pendingMove) {
          const next = this.pendingMove;
          this.pendingMove = null;
          this.kernel.handlePointerEvent(
            this.toPointerEvent("pointermove", {
              x: next.x,
              y: next.y,
              buttons: next.buttons,
              pointerId: payload.pointerId,
              modifiers: next.modifiers,
              timestamp: next.timestamp
            }),
          );
        }
        this.kernel.handlePointerEvent(
          this.toPointerEvent("pointerup", {
            x: payload.x,
            y: payload.y,
            buttons: payload.buttons,
            pointerId: payload.pointerId,
            modifiers: payload.modifiers,
            timestamp: payload.timestamp
          }),
        );
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_BOX_SELECTION_START, () => {
        this.boxSelectionActive = true;
        this.pendingMove = null;
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_BOX_SELECTION_CHANGE, (payload) => {
        if (!this.boxSelectionActive) return;
        this.kernel.handlePointerEvent(
          this.toPointerEvent("pointermove", {
            x: payload.x,
            y: payload.y,
            buttons: 1,
            pointerId: 1,
            modifiers: payload.modifiers,
            timestamp: payload.timestamp
          }),
        );
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_BOX_SELECTION_END, (payload) => {
        if (!this.boxSelectionActive) return;

        this.kernel.handlePointerEvent(
          this.toPointerEvent("pointermove", {
            x: payload.x1,
            y: payload.y1,
            buttons: 1,
            pointerId: 1,
            modifiers: payload.modifiers,
            timestamp: payload.timestamp
          }),
        );

        this.kernel.handlePointerEvent(
          this.toPointerEvent("pointerup", {
            x: payload.x1,
            y: payload.y1,
            buttons: 0,
            pointerId: 1,
            modifiers: payload.modifiers,
            timestamp: payload.timestamp
          }),
        );

        this.boxSelectionActive = false;
        this.ignoreNextMouseUpAt = payload.timestamp;
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_VIEWPORT_PAN_START, () => {
        this.viewportPanActive = true;
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_VIEWPORT_PAN_MOVE, (payload) => {
        if (!this.viewportPanActive) return;
        this.kernel.panViewport(payload.deltaX, payload.deltaY);
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_VIEWPORT_PAN_END, () => {
        this.viewportPanActive = false;
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_VIEWPORT_ZOOM, (payload) => {
        this.kernel.zoomViewportAt({ x: payload.x, y: payload.y }, payload.deltaY);
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_DOUBLE_CLICK, (payload) => {
        this.kernel.handlePointerEvent(
          this.toPointerEvent("doubleclick", {
            x: payload.x,
            y: payload.y,
            buttons: payload.buttons,
            pointerId: payload.pointerId,
            modifiers: payload.modifiers,
            timestamp: payload.timestamp
          }),
        );
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_KEY_DOWN, (payload) => {
        if (payload.code === "Space") this.spacePressed = true;
        this.kernel.handleKeyDown(this.toKeyEvent(payload));
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_KEY_UP, (payload) => {
        if (payload.code === "Space") this.spacePressed = false;
        this.kernel.handleKeyUp(this.toKeyEvent(payload));
      }),
    );

    this.unsubscribes.push(
      this.bus.subscribe(Topics.INPUT_CANVAS_RESIZED, (payload) => {
        this.kernel.setViewportSize({ width: payload.width, height: payload.height });
      }),
    );

    this.unsubscribes.push(
      this.kernel.on((event: GraphicsKernelEvent) => {
        if (event.type === "GRAPHICS.SELECTION_CHANGED") {
          const next = this.mapSelection(event.selectedIds);
          this.bus.publish(Topics.GRAPHICS_SELECTION_CHANGED, next);
          this.emitSelectionSetIfChanged();
          return;
        }

        if (event.type === "GRAPHICS.SCENE_CHANGED") {
          this.pendingDirtyRects = event.changes.affectedBounds.map((r) => inflateRect(r, 600));
          return;
        }

        if (event.type === "GRAPHICS.DRAW_COMMANDS_CHANGED") {
          this.lastViewTransform = event.viewTransform;
          const dirtyRects = this.pendingDirtyRects.map((r) => transformRect(event.viewTransform, r));
          this.pendingDirtyRects = [];
          this.emitViewportChanged(event.viewTransform);
          this.bus.publish(Topics.GRAPHICS_RENDER_UPDATED, {
            commands: event.commands,
            dirtyRects,
            viewTransform: event.viewTransform
          });
          this.emitSelectionSetIfChanged();
        }
      }),
    );
  }

  detach() {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }

  private mapTool(tool: string): SetToolParams {
    if (tool === "select") return { type: "selection" };
    return { type: "selection" };
  }

  private mapSelection(selectedIds: string[]) {
    const first = selectedIds[0];
    if (!first) return { type: "none" } as const;
    // Generic fallback for now
    return { type: "generic", id: first } as const;
  }

  private toKeyEvent(payload: {
    key: string;
    modifiers: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
    timestamp: number;
  }): InputKeyEvent {
    return {
      key: payload.key,
      modifiers: {
        alt: payload.modifiers.altKey,
        ctrl: payload.modifiers.ctrlKey,
        meta: payload.modifiers.metaKey,
        shift: payload.modifiers.shiftKey,
        space: this.spacePressed
      },
      timestamp: payload.timestamp
    };
  }

  private toPointerEvent(
    type: InputPointerEvent["type"],
    payload: {
      x: number;
      y: number;
      buttons: number;
      pointerId: number;
      modifiers: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
      timestamp: number;
      deltaX?: number;
      deltaY?: number;
    },
  ): InputPointerEvent {
    return {
      type,
      pointerId: payload.pointerId,
      buttons: payload.buttons,
      worldPosition: { x: payload.x, y: payload.y },
      screenPosition: { x: payload.x, y: payload.y },
      deltaX: payload.deltaX,
      deltaY: payload.deltaY,
      modifiers: {
        alt: payload.modifiers.altKey,
        ctrl: payload.modifiers.ctrlKey,
        meta: payload.modifiers.metaKey,
        shift: payload.modifiers.shiftKey,
        space: this.spacePressed
      },
      timestamp: payload.timestamp
    };
  }

  private mapHandleDragToTransform(
    handleType: string,
    startWorld: { x: number; y: number },
    currentWorld: { x: number; y: number },
    pivotWorld: { x: number; y: number },
  ): SelectionTransform | null {
    if (handleType === "move") {
      return {
        type: "translate",
        delta: { x: currentWorld.x - startWorld.x, y: currentWorld.y - startWorld.y }
      };
    }

    if (handleType === "rotate") {
      const a0 = Math.atan2(startWorld.y - pivotWorld.y, startWorld.x - pivotWorld.x);
      const a1 = Math.atan2(currentWorld.y - pivotWorld.y, currentWorld.x - pivotWorld.x);
      const angleRad = a1 - a0;
      if (!Number.isFinite(angleRad)) return null;
      return { type: "rotate", angleRad, pivot: pivotWorld };
    }

    const sx0 = startWorld.x - pivotWorld.x;
    const sy0 = startWorld.y - pivotWorld.y;
    const sx1 = currentWorld.x - pivotWorld.x;
    const sy1 = currentWorld.y - pivotWorld.y;
    const eps = 1e-9;

    if (handleType.includes("scale-")) {
      const uniform0 = Math.hypot(sx0, sy0);
      const uniform1 = Math.hypot(sx1, sy1);
      if (uniform0 < eps) return null;
      const s = uniform1 / uniform0;
      if (!Number.isFinite(s) || s <= 0) return null;
      return { type: "scale", scaleX: s, scaleY: s, pivot: pivotWorld };
    }

    if (Math.abs(sx0) < eps || Math.abs(sy0) < eps) return null;
    const scaleX = sx1 / sx0;
    const scaleY = sy1 / sy0;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return null;
    return { type: "scale", scaleX, scaleY, pivot: pivotWorld };
  }

  private emitViewportChanged(viewTransform: Transform2D): void {
    const scale = (Math.hypot(viewTransform.a, viewTransform.b) + Math.hypot(viewTransform.c, viewTransform.d)) / 2;
    const next = { scale, offsetX: viewTransform.e, offsetY: viewTransform.f };
    const prev = this.lastViewport;
    this.lastViewport = next;
    if (!prev || Math.abs(prev.scale - next.scale) > 1e-9) {
      this.bus.publish(Topics.VIEWPORT_ZOOM_CHANGED, { scale: next.scale });
    }
    if (!prev || Math.abs(prev.offsetX - next.offsetX) > 1e-6 || Math.abs(prev.offsetY - next.offsetY) > 1e-6) {
      this.bus.publish(Topics.VIEWPORT_PAN_CHANGED, { offsetX: next.offsetX, offsetY: next.offsetY, scale: next.scale });
    }
  }

  private emitSelectionSetIfChanged(): void {
    const selectedIds = this.kernel.getSelection();
    const bounds = this.kernel.getSelectionBounds();
    const idsKey = selectedIds.join("|");
    const boundsKey = bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "null";
    const prev = this.lastSelectionSetEmitted;
    if (prev && prev.idsKey === idsKey && prev.boundsKey === boundsKey) return;
    this.lastSelectionSetEmitted = { idsKey, boundsKey };

    this.bus.publish(Topics.GRAPHICS_SELECTION_SET_CHANGED, {
      selectedIds,
      bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null
    });
  }
}

function applyTransform2D(t: Transform2D, p: { x: number; y: number }): { x: number; y: number } {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}

function invertTransform2D(m: Transform2D): Transform2D {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
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

function transformRect(t: Transform2D, r: Rect): Rect {
  const p0 = applyTransform2D(t, { x: r.x, y: r.y });
  const p1 = applyTransform2D(t, { x: r.x + r.width, y: r.y });
  const p2 = applyTransform2D(t, { x: r.x + r.width, y: r.y + r.height });
  const p3 = applyTransform2D(t, { x: r.x, y: r.y + r.height });

  const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
  const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
  const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
  const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function inflateRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}

function safeRequestAnimationFrame(cb: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}
