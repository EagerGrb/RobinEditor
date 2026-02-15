import type { DrawCommand } from "../view/drawCommands.js";
import { ViewGenerator } from "../view/ViewGenerator.js";
import type { Point, Rect, Transform2D } from "../math/types.js";
import { rectFromPoints, rectUnion } from "../math/rect.js";
import { applyTransformToPoint, identityTransform, invertTransform } from "../math/transform.js";
import type { SceneModel, EntityModel } from "../model/models.js";
import { SceneManager, type SceneChangeSet } from "../scene/SceneManager.js";
import { createId } from "../scene/id.js";
import { ToolChain } from "../tools/ToolChain.js";
import type { InputKeyEvent, InputPointerEvent, SelectionState, SnapOptions, SnapResult, ToolContext, ToolType } from "../tools/Tool.js";
import { SelectionTool } from "../tools/SelectionTool.js";
import type {
  GraphicsKernelEvent,
  GraphicsKernelEventHandler,
  IGraphicsKernel,
  SelectionTransform,
  SetToolParams
} from "./IGraphicsKernel.js";
import { snapToGrid } from "../geometry/snap.js";
import type { ICommand } from "../history/ICommand.js";
import { HistoryManager } from "../history/HistoryManager.js";

class SnapshotSceneCommand implements ICommand {
  readonly id: string;
  readonly label: string;

  constructor(
    private readonly applySnapshot: (scene: SceneModel) => void,
    private readonly before: SceneModel,
    private readonly after: SceneModel,
    label: string,
  ) {
    this.id = createId("cmd_snapshot");
    this.label = label;
  }

  execute(): void {
    this.applySnapshot(this.after);
  }

  undo(): void {
    this.applySnapshot(this.before);
  }
}

export class GraphicsKernel implements IGraphicsKernel {
  private handlers = new Set<GraphicsKernelEventHandler>();

  private historyReplaying = false;
  private history = new HistoryManager({ maxStackSize: 100 });

  private lastViewportEmitted: { scale: number; offsetX: number; offsetY: number } | null = null;

  private gesture: {
    active: boolean;
    pointerId: number | null;
    baseline: SceneModel | null;
    hasChanges: boolean;
  } = {
    active: false,
    pointerId: null,
    baseline: null,
    hasChanges: false
  };

  private selectionTransform: {
    active: boolean;
    pointerId: number | null;
    startedGesture: boolean;
    pivot: Point | null;
    entities: Map<string, { start: Point; end: Point; transform: Transform2D }>; // Generalized for entities
  } = {
    active: false,
    pointerId: null,
    startedGesture: false,
    pivot: null,
    entities: new Map()
  };

  private scene = new SceneManager();
  private viewGenerator = new ViewGenerator();

  private worldToScreen: Transform2D = identityTransform();
  private screenToWorld: Transform2D = identityTransform();
  private viewportSize: { width: number; height: number } = { width: 1, height: 1 };

  private toolChain = new ToolChain(new SelectionTool());

  private selection: {
    selectedIds: Set<string>;
    hoverId: string | null;
    marqueeRect: Rect | null;
  } = {
    selectedIds: new Set<string>(),
    hoverId: null,
    marqueeRect: null
  };

  private ephemeral: DrawCommand[] = [];
  private drawCommands: DrawCommand[] = [];

  on(handler: GraphicsKernelEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  reset(): void {
    this.history.reset();
    this.resetGesture();
    const changes = this.scene.reset();
    this.selection.selectedIds.clear();
    this.selection.hoverId = null;
    this.selection.marqueeRect = null;
    this.ephemeral = [];
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
    this.emitSelection();
    this.recomputeDrawCommands();
  }

  load(scene: SceneModel): void {
    this.history.reset();
    this.resetGesture();
    const changes = this.scene.load(scene);
    this.selection.selectedIds.clear();
    this.selection.hoverId = null;
    this.selection.marqueeRect = null;
    this.ephemeral = [];
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
    this.emitSelection();
    this.recomputeDrawCommands();
  }

  save(): SceneModel {
    return this.scene.save();
  }

  setWorldToScreenTransform(transform: Transform2D): void {
    this.worldToScreen = transform;
    this.screenToWorld = invertTransform(transform);
    this.emitViewportIfChanged(transform);
    this.recomputeDrawCommands();
  }

  setViewportSize(size: { width: number; height: number }): void {
    this.viewportSize = { width: Math.max(1, size.width), height: Math.max(1, size.height) };
    this.recomputeDrawCommands();
  }

  panViewport(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    if (deltaX === 0 && deltaY === 0) return;

    this.setWorldToScreenTransform({
      ...this.worldToScreen,
      e: this.worldToScreen.e + deltaX,
      f: this.worldToScreen.f + deltaY
    });
  }

  zoomViewportAt(screenPoint: { x: number; y: number }, deltaY: number): void {
    const dy = typeof deltaY === "number" ? deltaY : 0;
    if (!Number.isFinite(dy) || dy === 0) return;

    const currentScale = this.scene.getWorldScaleFromViewTransform(this.worldToScreen);
    const factor = Math.exp(-dy * 0.001);
    const nextScale = clampNumber(currentScale * factor, 0.1, 8);
    if (!Number.isFinite(nextScale) || nextScale <= 0 || nextScale === currentScale) return;

    const anchorScreen = screenPoint;
    const anchorWorld = applyTransformToPoint(this.screenToWorld, anchorScreen);
    const next: Transform2D = {
      a: nextScale,
      b: 0,
      c: 0,
      d: nextScale,
      e: anchorScreen.x - anchorWorld.x * nextScale,
      f: anchorScreen.y - anchorWorld.y * nextScale
    };
    this.setWorldToScreenTransform(next);
  }

  resetViewport(): void {
    this.setWorldToScreenTransform(identityTransform());
  }

  setTool(params: SetToolParams): void {
    const next = this.createTool(params);
    this.toolChain.setBaseTool(next);
    this.ephemeral = [];
    this.recomputeDrawCommands();
  }

  getActiveTool(): ToolType {
    return this.toolChain.getActiveToolType();
  }

  handlePointerEvent(event: InputPointerEvent): void {
    const worldPosition = applyTransformToPoint(this.screenToWorld, event.screenPosition);
    const normalized: InputPointerEvent = { ...event, worldPosition };

    if (normalized.type === "pointerdown" && (normalized.buttons & 1) === 1) {
      this.beginGesture(normalized.pointerId);
    }
    if (normalized.type === "pointerup") {
      this.endGestureForPointer(normalized.pointerId);
    }
    this.toolChain.handlePointerEvent(normalized, this.toolContext());
    this.recomputeDrawCommands();
  }

  handleKeyDown(event: InputKeyEvent): void {
    if (this.shouldUndo(event)) {
      this.undo();
      return;
    }
    if (this.shouldRedo(event)) {
      this.redo();
      return;
    }
    this.toolChain.handleKeyDown(event, this.toolContext());
    if (event.key === "Escape" && this.toolChain.getActiveToolType() !== "selection") {
      this.setTool({ type: "selection" });
      return;
    }
    this.recomputeDrawCommands();
  }

  handleKeyUp(event: InputKeyEvent): void {
    this.toolChain.handleKeyUp(event, this.toolContext());
    this.recomputeDrawCommands();
  }

  beginSelectionTransform(pointerId: number): void {
    if (this.selection.selectedIds.size === 0) return;
    const baseline = this.gesture.active && this.gesture.baseline ? this.gesture.baseline : this.scene.save();
    const startedGesture = !this.gesture.active;
    if (startedGesture) {
      this.beginGesture(pointerId);
    }

    let bounds: Rect | null = null;
    const nextEntities = new Map<string, { start: Point; end: Point; transform: Transform2D }>();

    for (const id of this.selection.selectedIds) {
      const entity = baseline.entities.find((e) => e.id === id);
      if (entity) {
        bounds = bounds ? rectUnion(bounds, entity.boundingBox) : entity.boundingBox;
      }
    }

    if (!bounds) return;

    this.selectionTransform = {
      active: true,
      pointerId,
      startedGesture,
      pivot: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      entities: nextEntities
    };
  }

  updateSelectionTransform(transform: SelectionTransform): void {
    // Placeholder for generic transform logic
    if (!this.selectionTransform.active) return;
    if (this.selection.selectedIds.size === 0) return;
  }

  endSelectionTransform(pointerId?: number): void {
    if (!this.selectionTransform.active) return;
    const shouldEndGesture = this.selectionTransform.startedGesture;
    this.selectionTransform = {
      active: false,
      pointerId: null,
      startedGesture: false,
      pivot: null,
      entities: new Map()
    };
    if (shouldEndGesture) {
      this.endGestureForPointer(pointerId);
    }
  }

  setObjectProperties(id: string, patch: Record<string, unknown>): void {
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    const changes = this.scene.updateEntity(id, { metadata: patch });
    if (changes.updated.length === 0) return;

    const next = this.scene.getEntity(id);
    if (next) {
      this.emit({ type: "GRAPHICS.ENTITY_UPDATED", id: next.id, entityType: next.type, metadata: next.metadata });
    }

    this.recordSceneMutation();
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Change Properties"),
      );
    }
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  getDrawCommands(): DrawCommand[] {
    return this.drawCommands;
  }

  getSelection(): string[] {
    return Array.from(this.selection.selectedIds);
  }

  getSelectionBounds(): Rect | null {
    if (this.selection.selectedIds.size === 0) return null;
    let bounds: Rect | null = null;
    for (const id of this.selection.selectedIds) {
      const entity = this.scene.getEntity(id);
      if (entity) {
        bounds = bounds ? rectUnion(bounds, entity.boundingBox) : entity.boundingBox;
      }
    }
    return bounds;
  }

  private emit(event: GraphicsKernelEvent): void {
    for (const h of this.handlers) {
      h(event);
    }
  }

  private emitSelection(): void {
    this.emit({
      type: "GRAPHICS.SELECTION_CHANGED",
      selectedIds: Array.from(this.selection.selectedIds)
    });
  }

  private recomputeDrawCommands(): void {
    const viewportWorldRect = this.getViewportWorldRect();
    this.drawCommands = this.viewGenerator.generate({
      grid: { visible: true, size: 50, subdivisions: 5 }, // Default grid
      scene: this.scene.save(), // Pass scene model
      selection: this.selection,
      viewportWorldRect,
      ephemeral: this.ephemeral
    });
    this.emit({ type: "GRAPHICS.DRAW_COMMANDS_CHANGED", commands: this.drawCommands, viewTransform: this.worldToScreen });
  }

  private emitViewportIfChanged(transform: Transform2D): void {
    const scale = (Math.hypot(transform.a, transform.b) + Math.hypot(transform.c, transform.d)) / 2;
    const next = { scale, offsetX: transform.e, offsetY: transform.f };
    const prev = this.lastViewportEmitted;
    this.lastViewportEmitted = next;

    if (!prev || Math.abs(prev.scale - next.scale) > 1e-9) {
      this.emit({ type: "VIEWPORT.ZOOM_CHANGED", scale: next.scale });
    }
    if (!prev || Math.abs(prev.offsetX - next.offsetX) > 1e-6 || Math.abs(prev.offsetY - next.offsetY) > 1e-6) {
      this.emit({ type: "VIEWPORT.PAN_CHANGED", offsetX: next.offsetX, offsetY: next.offsetY, scale: next.scale });
    }
  }

  private applySnapshot(scene: SceneModel): void {
    this.historyReplaying = true;
    try {
      const changes = this.scene.load(scene);
      this.ephemeral = [];
      this.selection.hoverId = null;
      this.selection.marqueeRect = null;
      this.selection.selectedIds = new Set(
        Array.from(this.selection.selectedIds).filter((id) => this.shapeExists(id))
      );
      this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
      this.emitSelection();
      this.recomputeDrawCommands();
    } finally {
      this.historyReplaying = false;
    }
  }

  private recordSceneMutation(): void {
    if (this.historyReplaying) return;
    if (this.gesture.active && this.gesture.baseline && !this.gesture.hasChanges) {
      this.gesture.hasChanges = true;
      return;
    }
  }

  private beginGesture(pointerId: number): void {
    this.gesture = {
      active: true,
      pointerId,
      baseline: this.scene.save(),
      hasChanges: false
    };
  }

  private endGestureForPointer(pointerId?: number): void {
    if (!this.gesture.active) return;
    if (pointerId != null && this.gesture.pointerId != null && pointerId !== this.gesture.pointerId) return;

    if (!this.historyReplaying && this.gesture.baseline && this.gesture.hasChanges) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), this.gesture.baseline, this.scene.save(), "Gesture"),
      );
    }
    this.resetGesture();
  }

  private resetGesture(): void {
    this.gesture = {
      active: false,
      pointerId: null,
      baseline: null,
      hasChanges: false
    };
  }

  private shouldUndo(event: InputKeyEvent): boolean {
    const key = event.key.toLowerCase();
    const mod = event.modifiers.ctrl || event.modifiers.meta;
    return mod && !event.modifiers.shift && key === "z";
  }

  private shouldRedo(event: InputKeyEvent): boolean {
    const key = event.key.toLowerCase();
    const mod = event.modifiers.ctrl || event.modifiers.meta;
    if (!mod) return false;
    if (key === "y") return true;
    if (event.modifiers.shift && key === "z") return true;
    return false;
  }

  private shapeExists(id: string): boolean {
    return !!this.scene.getEntity(id);
  }

  private toolContext(): ToolContext {
    return {
      getSelectionState: (): SelectionState => ({
        selectedIds: this.selection.selectedIds,
        hoverId: this.selection.hoverId,
        marqueeRect: this.selection.marqueeRect
      }),
      setHover: (id: string | null) => {
        this.selection.hoverId = id;
      },
      setSelection: (ids: string[], mode: "replace" | "toggle" | "add") => {
        if (mode === "replace") {
          this.selection.selectedIds = new Set(ids);
        } else if (mode === "toggle") {
          for (const id of ids) {
            if (this.selection.selectedIds.has(id)) this.selection.selectedIds.delete(id);
            else this.selection.selectedIds.add(id);
          }
        } else {
          for (const id of ids) this.selection.selectedIds.add(id);
        }
        this.emitSelection();
      },
      setMarqueeRect: (rect: Rect | null) => {
        this.selection.marqueeRect = rect;
      },
      snapPoint: (p: Point, options: SnapOptions): SnapResult => this.snapPoint(p, options),
      hitTest: (p: Point, thresholdPx: number): string | null => this.hitTestPoint(p, thresholdPx),
      hitTestRect: (rect: Rect, mode?: "intersect" | "contain"): string[] => this.hitTestRect(rect, mode),
      translateSelected: (delta: Point) => {
        this.translateSelected(delta);
      },
      deleteSelection: () => {
        this.deleteSelection();
      },
      setEphemeralDrawCommands: (commands) => {
        this.ephemeral = commands;
      }
    };
  }

  private createTool(params: SetToolParams) {
    // Only selection tool for now
    return new SelectionTool();
  }

  private getViewportWorldRect(): Rect | null {
    const p0 = applyTransformToPoint(this.screenToWorld, { x: 0, y: 0 });
    const p1 = applyTransformToPoint(this.screenToWorld, { x: this.viewportSize.width, y: this.viewportSize.height });
    return rectFromPoints(p0, p1);
  }

  private thresholdWorldFromPx(thresholdPx: number): number {
    const scale = this.scene.getWorldScaleFromViewTransform(this.worldToScreen);
    if (scale <= 0) return thresholdPx;
    return thresholdPx / scale;
  }

  private snapPoint(p: Point, options: SnapOptions): SnapResult {
    if (options.thresholdPx <= 0) return { point: p, candidate: null };
    const thresholdWorld = this.thresholdWorldFromPx(options.thresholdPx);
    
    if (options.enableGrid) {
      const gp = snapToGrid(p, 50); // Hardcoded grid spacing for now
      const dist = Math.hypot(gp.x - p.x, gp.y - p.y);
      if (dist <= thresholdWorld) {
        return {
          point: gp,
          candidate: { kind: "grid", point: gp, distance: dist }
        };
      }
    }
    return { point: p, candidate: null };
  }

  private hitTestPoint(p: Point, thresholdPx: number): string | null {
    const thresholdWorld = this.thresholdWorldFromPx(thresholdPx);

    const queryRect: Rect = {
      x: p.x - thresholdWorld,
      y: p.y - thresholdWorld,
      width: thresholdWorld * 2,
      height: thresholdWorld * 2
    };

    const candidateIds = this.scene.queryIds(queryRect);

    let bestId: string | null = null;
    let bestMetric = Infinity;

    for (const id of candidateIds) {
      const entity = this.scene.getEntity(id);
      if (!entity) continue;
      const r = entity.boundingBox;
      if (p.x >= r.x - thresholdWorld && p.x <= r.x + r.width + thresholdWorld &&
          p.y >= r.y - thresholdWorld && p.y <= r.y + r.height + thresholdWorld) {
          
          // Distance to center as metric
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const dist = Math.hypot(p.x - cx, p.y - cy);
          
          if (dist < bestMetric) {
              bestMetric = dist;
              bestId = entity.id;
          }
      }
    }
    return bestId;
  }

  private hitTestRect(rect: Rect, mode: "intersect" | "contain" = "intersect"): string[] {
    const candidates = this.scene.queryIds(rect);
    if (mode === "intersect") return candidates;

    const hits: string[] = [];
    for (const id of candidates) {
      const entity = this.scene.getEntity(id);
      if (!entity) continue;
      const b = entity.boundingBox;
      if (
        b.x >= rect.x &&
        b.y >= rect.y &&
        b.x + b.width <= rect.x + rect.width &&
        b.y + b.height <= rect.y + rect.height
      ) {
        hits.push(id);
      }
    }
    return hits;
  }

  private translateSelected(delta: Point): void {
    if (delta.x === 0 && delta.y === 0) return;
    if (this.selection.selectedIds.size === 0) return;

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    const changesets: SceneChangeSet[] = [];

    for (const id of this.selection.selectedIds) {
      const entity = this.scene.getEntity(id);
      if (!entity) continue;

      changesets.push(
        this.scene.updateEntity(id, {
          transform: { ...entity.transform, e: entity.transform.e + delta.x, f: entity.transform.f + delta.y },
          boundingBox: { ...entity.boundingBox, x: entity.boundingBox.x + delta.x, y: entity.boundingBox.y + delta.y }
        }),
      );
    }

    const merged = mergeChangesets(changesets);
    if (merged.updated.length === 0 && merged.removed.length === 0 && merged.added.length === 0) return;

    this.recordSceneMutation();
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Move Entities"),
      );
    }
  }

  private deleteSelection(): void {
    if (this.selection.selectedIds.size === 0) return;

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    const changesets: SceneChangeSet[] = [];
    for (const id of this.selection.selectedIds) {
      changesets.push(this.scene.removeEntity(id));
    }
    this.selection.selectedIds.clear();
    this.emitSelection();

    const merged = mergeChangesets(changesets);
    this.recordSceneMutation();
    if (merged.added.length || merged.updated.length || merged.removed.length) {
      this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    }
    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Delete Entities"),
      );
    }
  }
}

function mergeChangesets(changesets: SceneChangeSet[]): SceneChangeSet {
  const added = new Set<string>();
  const updated = new Set<string>();
  const removed = new Set<string>();
  const affectedBounds: Rect[] = [];

  for (const cs of changesets) {
    for (const id of cs.added) added.add(id);
    for (const id of cs.updated) updated.add(id);
    for (const id of cs.removed) removed.add(id);
    affectedBounds.push(...cs.affectedBounds);
  }

  for (const id of removed) {
    added.delete(id);
    updated.delete(id);
  }

  return {
    added: Array.from(added),
    updated: Array.from(updated),
    removed: Array.from(removed),
    affectedBounds
  };
}

function clampNumber(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
