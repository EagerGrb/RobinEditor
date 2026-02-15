import { Topics, type EventBus } from "@render/event-bus";
import { Vec2, intersect, evalPoint, capsuleFromCenter, circleCurve, rotatedRectLines, type Arc2, type Bezier2, type Curve2, type Line2 } from "@render/geometry";
import { makeIntersectionDebugCommands } from "@render/graphics-kernel";
import { decodeClipboardPayload, encodeClipboardPayload, rectCenter, type RenderClipboardPayloadV1 } from "./clipboard/renderClipboard";
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
  private viewportSize: { width: number; height: number } | null = null;
  private debugIntersectionDemoActive = false;
  private intersectionRafId: number | null = null;
  private lastSelectionSetEmitted: { idsKey: string; boundsKey: string } | null = null;
  private pendingMove: {
    x: number;
    y: number;
    buttons: number;
    modifiers: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
    timestamp: number;
  } | null = null;
  private moveRafId: number | null = null;
  private lastMouseScreen: { x: number; y: number } | null = null;
  private clipboardMemory: { text: string; parsed: RenderClipboardPayloadV1 | null } | null = null;
  private pasteSequence = 0;
  private pasteSequenceKey: number | null = null;

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
        if (payload.command === "DEBUG.INTERSECTION_DEMO") {
          this.debugIntersectionDemoActive = !this.debugIntersectionDemoActive;
          if (!this.debugIntersectionDemoActive) {
            this.kernel.setEphemeralDrawCommands([]);
            return;
          }
          this.scheduleIntersectionOverlayUpdate();
          return;
        }
        if (payload.command === "DEBUG.INTERSECTION_CLEAR") {
          this.debugIntersectionDemoActive = false;
          this.kernel.setEphemeralDrawCommands([]);
          return;
        }
        if (payload.command === "EDIT.COPY") {
          void this.copySelectionToClipboard();
          return;
        }
        if (payload.command === "EDIT.PASTE") {
          void this.pasteFromClipboard();
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
        const pivotWorld = pivotFromBoundsAndHandle(bounds, payload.handleType);

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

        const t = this.mapHandleDragToTransform(state.handleType, startWorld, currentWorld, state.pivotWorld, payload.modifiers);
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
        this.lastMouseScreen = { x: payload.x, y: payload.y };
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
        this.viewportSize = { width: payload.width, height: payload.height };
        this.kernel.setViewportSize({ width: payload.width, height: payload.height });
      }),
    );

    this.unsubscribes.push(
      this.kernel.on((event: GraphicsKernelEvent) => {
        if (event.type === "GRAPHICS.SELECTION_CHANGED") {
          const next = this.mapSelection(event.selectedIds);
          this.bus.publish(Topics.GRAPHICS_SELECTION_CHANGED, next);
          this.emitSelectionSetIfChanged();
          this.scheduleIntersectionOverlayUpdate();
          return;
        }

        if (event.type === "GRAPHICS.ENTITY_UPDATED") {
          this.bus.publish(Topics.GRAPHICS_ENTITY_UPDATED, {
            id: event.id,
            type: event.entityType,
            metadata: event.metadata
          });
          return;
        }

        if (event.type === "GRAPHICS.SCENE_CHANGED") {
          this.pendingDirtyRects = event.changes.affectedBounds.map((r) => inflateRect(r, 600));
          this.scheduleIntersectionOverlayUpdate();
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
    if (tool === "track") return { type: "track" };
    if (tool === "arc") return { type: "arc" };
    if (tool === "bezier") return { type: "bezier" };
    if (tool === "pad") return { type: "pad" };
    if (tool === "via") return { type: "via" };
    return { type: "selection" };
  }

  private mapSelection(selectedIds: string[]) {
    const first = selectedIds[0];
    if (!first) return { type: "none" } as const;

    const scene = this.kernel.save();
    const entity = scene.entities.find((e) => e.id === first);
    if (!entity) return { type: "generic", id: first } as const;
    return { type: entity.type, id: entity.id, metadata: entity.metadata } as const;
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
    modifiers: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
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

    if (handleType.includes("scale-") && modifiers.shiftKey) {
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

  private scheduleIntersectionOverlayUpdate(): void {
    if (!this.debugIntersectionDemoActive) return;
    if (this.intersectionRafId != null) return;
    this.intersectionRafId = safeRequestAnimationFrame(() => {
      this.intersectionRafId = null;
      this.updateIntersectionOverlay();
    });
  }

  private updateIntersectionOverlay(): void {
    if (!this.debugIntersectionDemoActive) return;

    const selectedIds = this.kernel.getSelection();
    if (selectedIds.length < 2) {
      this.kernel.setEphemeralDrawCommands([]);
      return;
    }

    const scene = this.kernel.save() as any;
    const entities: any[] = selectedIds
      .map((id) => scene.entities.find((e: any) => e.id === id))
      .filter(Boolean);

    if (entities.length < 2) {
      this.kernel.setEphemeralDrawCommands([]);
      return;
    }

    const curveSets = entities.map((e) => ({ curves: entityToCurves(e) }));

    const points: Array<{ x: number; y: number }> = [];
    const debugShapes: any[] = [];
    const palette = ["#2f54eb", "#13c2c2", "#52c41a", "#faad14", "#eb2f96", "#722ed1"];

    for (let i = 0; i < curveSets.length; i++) {
      const color = palette[i % palette.length]!;
      const set = curveSets[i]!;
      for (let k = 0; k < set.curves.length; k++) {
        const c = set.curves[k]!;
        if (c.kind === "line") {
          debugShapes.push({ kind: "line", a: c.a, b: c.b, style: { strokeColor: color, lineWidth: 1, opacity: 0.7 } });
        } else if (c.kind === "arc") {
          debugShapes.push({
            kind: "arc",
            center: c.c,
            radius: c.r,
            startAngle: c.start,
            endAngle: c.start + c.delta,
            anticlockwise: c.delta < 0,
            style: { strokeColor: color, lineWidth: 1, opacity: 0.7 }
          });
        } else if (c.kind === "bezier" && c.degree === 3 && c.cp.length === 4) {
          debugShapes.push({
            kind: "bezier",
            p0: c.cp[0],
            p1: c.cp[1],
            p2: c.cp[2],
            p3: c.cp[3],
            style: { strokeColor: color, lineWidth: 1, opacity: 0.7 }
          });
        }
      }
    }

    for (let i = 0; i < curveSets.length; i++) {
      for (let j = i + 1; j < curveSets.length; j++) {
        const a = curveSets[i]!;
        const b = curveSets[j]!;
        for (const c0 of a.curves) {
          for (const c1 of b.curves) {
            const out = intersect(c0, c1, { distanceEpsilon: 1e-2, maxDepth: 24 });
            for (const it of out.items) {
              if (it.kind !== "point") continue;
              const p = evalPoint(c0 as any, (it as any).t0);
              points.push(p);
            }
          }
        }
      }
    }

    const uniq = dedupePoints(points, 1e-2);
    const shapes: any[] = [...debugShapes];
    for (let i = 0; i < uniq.length; i++) {
      const p = uniq[i]!;
      shapes.push({
        kind: "point",
        p,
        rWorld: 6,
        style: { fillColor: "#ffe58f", strokeColor: "#000000", lineWidth: 1, opacity: 0.95 }
      });
    }

    const commands = makeIntersectionDebugCommands(shapes, { layer: 100000, zIndex: 100000, pointRadiusWorld: 6 });
    this.kernel.setEphemeralDrawCommands(commands);
  }

  private getPasteTargetWorld(): { x: number; y: number } {
    const view = this.lastViewTransform;
    if (!view) return { x: 0, y: 0 };
    const inv = invertTransform2D(view);
    if (this.lastMouseScreen) return applyTransform2D(inv, this.lastMouseScreen);
    const size = this.viewportSize;
    if (size) return applyTransform2D(inv, { x: size.width / 2, y: size.height / 2 });
    return applyTransform2D(inv, { x: 0, y: 0 });
  }

  private async writeClipboardText(text: string): Promise<void> {
    this.clipboardMemory = { text, parsed: decodeClipboardPayload(text) };
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      }
    } catch {
    }
  }

  private async readClipboardText(): Promise<string | null> {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        return await navigator.clipboard.readText();
      }
    } catch {
    }
    return this.clipboardMemory?.text ?? null;
  }

  private async copySelectionToClipboard(): Promise<void> {
    const selectedIds = this.kernel.getSelection();
    if (selectedIds.length === 0) return;
    const scene = this.kernel.save() as any;
    const entities: any[] = selectedIds.map((id) => scene.entities.find((e: any) => e.id === id)).filter(Boolean);
    if (entities.length === 0) return;
    const bounds = this.kernel.getSelectionBounds();

    const payload: RenderClipboardPayloadV1 = {
      app: "render",
      version: 1,
      kind: "pcb.entities",
      createdAt: Date.now(),
      bounds,
      entities: JSON.parse(JSON.stringify(entities))
    };

    const text = encodeClipboardPayload(payload);
    this.pasteSequence = 0;
    this.pasteSequenceKey = payload.createdAt;
    await this.writeClipboardText(text);
  }

  private async pasteFromClipboard(): Promise<void> {
    const text = await this.readClipboardText();
    if (!text) return;
    const payload = decodeClipboardPayload(text);
    if (!payload) return;

    const key = payload.createdAt;
    if (this.pasteSequenceKey !== key) {
      this.pasteSequence = 0;
      this.pasteSequenceKey = key;
    }

    const bounds = payload.bounds;
    const target = this.getPasteTargetWorld();
    const base = bounds ? rectCenter(bounds) : target;
    const step = 10 * this.pasteSequence;
    const offset = { x: target.x - base.x + step, y: target.y - base.y + step };
    this.pasteSequence++;
    this.kernel.pasteEntities(payload.entities, { offset, label: "Paste", select: true });
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

function pivotFromBoundsAndHandle(bounds: Rect, handleType: string): { x: number; y: number } {
  const nw = { x: bounds.x, y: bounds.y };
  const ne = { x: bounds.x + bounds.width, y: bounds.y };
  const se = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  const sw = { x: bounds.x, y: bounds.y + bounds.height };
  if (handleType === "scale-nw") return se;
  if (handleType === "scale-ne") return sw;
  if (handleType === "scale-se") return nw;
  if (handleType === "scale-sw") return ne;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function angleDeltaSigned(from: number, to: number, ccw: boolean): number {
  const PI2 = Math.PI * 2;
  const normalize = (v: number) => ((v % PI2) + PI2) % PI2;
  const f = normalize(from);
  const t = normalize(to);
  let d = t - f;
  if (ccw) {
    if (d < 0) d += PI2;
    return d;
  }
  if (d > 0) d -= PI2;
  return d;
}

function arcTrackCenterlineCurve(entity: any): Arc2 | null {
  if (!entity?.center || typeof entity.radius !== "number" || typeof entity.startAngle !== "number" || typeof entity.endAngle !== "number") {
    return null;
  }
  const delta = angleDeltaSigned(entity.startAngle, entity.endAngle, !!entity.clockwise);
  if (!Number.isFinite(delta) || Math.abs(delta) <= 1e-12) return null;
  return { kind: "arc", c: { x: entity.center.x, y: entity.center.y }, r: entity.radius, start: entity.startAngle, delta };
}

function entityToCurves(entity: any): Curve2[] {
  if (entity?.type === "VIA" && entity.position && typeof entity.diameter === "number") {
    return [circleCurve(entity.position, entity.diameter / 2)];
  }

  if (entity?.type === "PAD" && entity.position && entity.size && typeof entity.rotation === "number") {
    const rot = (entity.rotation * Math.PI) / 180;
    const w = entity.size.w as number;
    const h = entity.size.h as number;
    if (entity.shape === "circle") return [circleCurve(entity.position, Math.min(w, h) / 2)];
    if (entity.shape === "oval") return capsuleFromCenter(entity.position, w, h, rot);
    return rotatedRectLines(entity.position, w, h, rot);
  }

  if (entity?.type === "TRACK" && Array.isArray(entity.points) && typeof entity.width === "number") {
    const out: Curve2[] = [];
    const pts = entity.points as Array<{ x: number; y: number }>;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!Number.isFinite(len) || len <= 1e-9) continue;
      out.push({ kind: "line", a, b });
    }
    return out;
  }

  if (entity?.type === "ARC_TRACK") {
    const centerline = arcTrackCenterlineCurve(entity);
    return centerline ? [centerline] : [];
  }

  if (entity?.type === "BEZIER_TRACK") {
    const p0 = entity?.p0;
    const p1 = entity?.p1;
    const p2 = entity?.p2;
    const p3 = entity?.p3;
    if (!p0 || !p1 || !p2 || !p3) return [];
    const bez: Bezier2 = { kind: "bezier", degree: 3, cp: [p0, p1, p2, p3] };
    return [bez];
  }

  if (entity?.boundingBox) {
    const b = entity.boundingBox as Rect;
    const a: Line2 = { kind: "line", a: { x: b.x, y: b.y }, b: { x: b.x + b.width, y: b.y } };
    const c: Line2 = { kind: "line", a: { x: b.x + b.width, y: b.y }, b: { x: b.x + b.width, y: b.y + b.height } };
    const d: Line2 = { kind: "line", a: { x: b.x + b.width, y: b.y + b.height }, b: { x: b.x, y: b.y + b.height } };
    const e: Line2 = { kind: "line", a: { x: b.x, y: b.y + b.height }, b: { x: b.x, y: b.y } };
    return [a, c, d, e];
  }

  return [];
}

function dedupePoints(points: Array<{ x: number; y: number }>, eps: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const epsSq = eps * eps;
  for (const p of points) {
    let ok = true;
    for (const q of out) {
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      if (dx * dx + dy * dy <= epsSq) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(p);
  }
  return out;
}
