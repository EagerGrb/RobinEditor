import type { DrawCommand } from "../view/drawCommands.js";
import { ViewGenerator } from "../view/ViewGenerator.js";
import type { Point, Rect, Transform2D } from "../math/types.js";
import { rectFromPoints, rectUnion } from "../math/rect.js";
import { applyTransformToPoint, identityTransform, invertTransform } from "../math/transform.js";
import type { SceneModel, EntityModel } from "../model/models.js";
import { SceneManager, type SceneChangeSet } from "../scene/SceneManager.js";
import { createId } from "../scene/id.js";
import type { InputKeyEvent, InputPointerEvent, SelectionState, SnapOptions, SnapResult, ToolContext, ToolType } from "../tools/Tool.js";
import { IntersectionRunner } from "./debug/IntersectionRunner.js";
import type { GraphicsKernelEvent, GraphicsKernelEventHandler, IGraphicsKernel, SelectionTransform, SetToolParams } from "./IGraphicsKernel.js";
import type { ICommand } from "../history/ICommand.js";
import { HistoryManager } from "../history/HistoryManager.js";
import { ToolManager } from "./tools/ToolManager.js";

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
  private toolManager = new ToolManager();

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
    baseline: SceneModel | null;
    entities: Map<string, EntityModel>;
  } = {
    active: false,
    pointerId: null,
    startedGesture: false,
    pivot: null,
    baseline: null,
    entities: new Map()
  };

  private scene = new SceneManager();
  private viewGenerator = new ViewGenerator();

  private worldToScreen: Transform2D = identityTransform();
  private screenToWorld: Transform2D = identityTransform();
  private viewportSize: { width: number; height: number } = { width: 1, height: 1 };

  private selection: {
    selectedIds: Set<string>;
    hoverId: string | null;
    marqueeRect: Rect | null;
  } = {
    selectedIds: new Set<string>(),
    hoverId: null,
    marqueeRect: null
  };

  private ghostEntity: EntityModel | null = null;
  private ephemeral: DrawCommand[] = [];
  private drawCommands: DrawCommand[] = [];

  constructor() {
    this.toolManager.activeTool.onEnter(this.toolContext());
  }

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
    this.ghostEntity = null;
    this.ephemeral = [];
    this.toolManager.setTool("selection", this.toolContext());
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
    this.ghostEntity = null;
    this.ephemeral = [];
    this.toolManager.setTool("selection", this.toolContext());
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
    this.toolManager.setTool(params.type, this.toolContext());
    this.ephemeral = [];
    this.ghostEntity = null;
    this.recomputeDrawCommands();
  }

  getActiveTool(): ToolType {
    return this.toolManager.activeToolType;
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
    const ctx = this.toolContext();
    if (normalized.type === "pointerdown") this.toolManager.onPointerDown(normalized, ctx);
    if (normalized.type === "pointermove") this.toolManager.onPointerMove(normalized, ctx);
    if (normalized.type === "pointerup") this.toolManager.onPointerUp(normalized, ctx);
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
    this.toolManager.onKeyDown(event, this.toolContext());
    if (event.key === "Escape" && this.toolManager.activeToolType !== "selection") {
      this.setTool({ type: "selection" });
      return;
    }
    this.recomputeDrawCommands();
  }

  handleKeyUp(event: InputKeyEvent): void {
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
    const nextEntities = new Map<string, EntityModel>();

    for (const id of this.selection.selectedIds) {
      const entity = baseline.entities.find((e) => e.id === id);
      if (entity) {
        bounds = bounds ? rectUnion(bounds, entity.boundingBox) : entity.boundingBox;
        nextEntities.set(id, deepCloneEntity(entity));
      }
    }

    if (!bounds) return;

    this.selectionTransform = {
      active: true,
      pointerId,
      startedGesture,
      pivot: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      baseline,
      entities: nextEntities
    };
  }

  updateSelectionTransform(transform: SelectionTransform): void {
    if (!this.selectionTransform.active) return;
    if (this.selection.selectedIds.size === 0) return;
    if (!this.selectionTransform.pivot) return;
    if (!this.selectionTransform.baseline) return;

    const pivot = transform.pivot ?? this.selectionTransform.pivot;
    const changesets: SceneChangeSet[] = [];

    for (const [id, startEntity] of this.selectionTransform.entities) {
      if (!this.selection.selectedIds.has(id)) continue;
      const patch = patchEntityByTransform(startEntity, transform, pivot);
      changesets.push(this.scene.updateEntity(id, patch));
    }

    const merged = mergeChangesets(changesets);
    if (merged.updated.length === 0 && merged.removed.length === 0 && merged.added.length === 0) return;
    this.recordSceneMutation();
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    this.recomputeDrawCommands();
  }

  endSelectionTransform(pointerId?: number): void {
    if (!this.selectionTransform.active) return;
    const shouldEndGesture = this.selectionTransform.startedGesture;
    this.selectionTransform = {
      active: false,
      pointerId: null,
      startedGesture: false,
      pivot: null,
      baseline: null,
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

  exportEntities(ids: string[]): EntityModel[] {
    const out: EntityModel[] = [];
    for (const id of ids) {
      const entity = this.scene.getEntity(id);
      if (!entity) continue;
      out.push(deepCloneEntity(entity));
    }
    return out;
  }

  pasteEntities(entities: EntityModel[], options?: { offset?: Point; select?: boolean }): string[] {
    if (!Array.isArray(entities) || entities.length === 0) return [];
    const offset = options?.offset ?? { x: 10, y: 10 };
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;

    const changesets: SceneChangeSet[] = [];
    const pastedIds: string[] = [];

    for (const e of entities) {
      const clone = deepCloneEntity(e);
      const nextId = createId("paste");
      (clone as any).id = nextId;
      pastedIds.push(nextId);

      const patch = patchEntityByTransform(clone, { type: "translate", delta: offset }, { x: 0, y: 0 });
      const placed: any = { ...clone, ...patch };
      if (patch.boundingBox) placed.boundingBox = patch.boundingBox;

      changesets.push(this.scene.addEntity(placed as EntityModel));
    }

    const merged = mergeChangesets(changesets);
    this.recordSceneMutation();
    if (merged.added.length || merged.updated.length || merged.removed.length) {
      this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    }

    if (options?.select !== false) {
      this.selection.selectedIds = new Set(pastedIds);
      this.emitSelection();
    }

    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Paste"),
      );
    }

    return pastedIds;
  }

  runIntersectionDebug(): void {
    const selectedIds = Array.from(this.selection.selectedIds);
    if (selectedIds.length < 2) {
      console.warn("Select at least 2 entities to intersect");
      return;
    }
    const entities = selectedIds.map(id => this.scene.getEntity(id)).filter((e): e is EntityModel => !!e);
    const commands = IntersectionRunner.run(entities);
    this.ephemeral = commands;
    this.recomputeDrawCommands();
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
    const scene = this.scene.save();
    if (this.ghostEntity) {
      scene.entities = [...scene.entities, this.ghostEntity];
    }
    this.drawCommands = this.viewGenerator.generate({
      grid: { visible: true, size: 50, subdivisions: 5 }, // Default grid
      scene, // include ghost entity for true preview rendering
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
      rotateSelected: (angleDeg: number) => {
        this.rotateSelected(angleDeg);
      },
      deleteSelection: () => {
        this.deleteSelection();
      },
      addEntity: (entity: EntityModel) => {
        const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
        const changes = this.scene.addEntity(entity);
        this.recordSceneMutation();
        if (changes.added.length || changes.updated.length || changes.removed.length) {
          this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
        }
        if (baseline) {
          this.history.pushExecuted(
            new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Add Entity"),
          );
        }
      },
      setGhostEntity: (entity: EntityModel | null) => {
        this.ghostEntity = entity;
      },
      setEphemeralDrawCommands: (commands) => {
        this.ephemeral = commands;
      }
    };
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

      const patch: Partial<EntityModel> & { metadata?: Record<string, unknown> } = {
        boundingBox: { ...entity.boundingBox, x: entity.boundingBox.x + delta.x, y: entity.boundingBox.y + delta.y }
      };

      if (entity.type === "TRACK") {
        const points = Array.isArray((entity as any).points) ? (entity as any).points : [];
        patch["points" as never] = points.map((p: any) => ({ x: p.x + delta.x, y: p.y + delta.y })) as never;
      } else if (entity.type === "ARC_TRACK") {
        const center = (entity as any).center;
        if (center) patch["center" as never] = { x: center.x + delta.x, y: center.y + delta.y } as never;
      } else if (entity.type === "BEZIER_TRACK") {
        const b: any = entity as any;
        patch["p0" as never] = { x: b.p0.x + delta.x, y: b.p0.y + delta.y } as never;
        patch["p1" as never] = { x: b.p1.x + delta.x, y: b.p1.y + delta.y } as never;
        patch["p2" as never] = { x: b.p2.x + delta.x, y: b.p2.y + delta.y } as never;
        patch["p3" as never] = { x: b.p3.x + delta.x, y: b.p3.y + delta.y } as never;
      } else if (entity.type === "PAD") {
        const pos = (entity as any).position;
        if (pos) patch["position" as never] = { x: pos.x + delta.x, y: pos.y + delta.y } as never;
        patch.transform = { ...entity.transform, e: entity.transform.e + delta.x, f: entity.transform.f + delta.y };
      } else if (entity.type === "VIA") {
        const pos = (entity as any).position;
        if (pos) patch["position" as never] = { x: pos.x + delta.x, y: pos.y + delta.y } as never;
        patch.transform = { ...entity.transform, e: entity.transform.e + delta.x, f: entity.transform.f + delta.y };
      } else {
        patch.transform = { ...entity.transform, e: entity.transform.e + delta.x, f: entity.transform.f + delta.y };
      }

      changesets.push(
        this.scene.updateEntity(id, patch),
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

  private rotateSelected(_angleDeg: number): void {
    if (!Number.isFinite(_angleDeg) || _angleDeg === 0) return;
    if (this.selection.selectedIds.size === 0) return;

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;

    const bounds = this.getSelectionBounds();
    if (!bounds) return;
    const pivot = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const angleRad = (_angleDeg * Math.PI) / 180;

    const changesets: SceneChangeSet[] = [];
    for (const id of this.selection.selectedIds) {
      const entity = this.scene.getEntity(id);
      if (!entity) continue;
      const patch = patchEntityByTransform(entity, { type: "rotate", angleRad, pivot }, pivot);
      changesets.push(this.scene.updateEntity(id, patch));
    }

    const merged = mergeChangesets(changesets);
    if (merged.updated.length === 0 && merged.removed.length === 0 && merged.added.length === 0) return;

    this.recordSceneMutation();
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Rotate Entities"),
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

function snapToGrid(p: Point, gridSize: number): Point {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return p;
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize
  };
}

function deepCloneEntity<T extends EntityModel>(e: T): T {
  const clone: any = {
    ...e,
    transform: { ...e.transform },
    boundingBox: { ...e.boundingBox },
    metadata: { ...(e.metadata ?? {}) }
  };
  if (Array.isArray((e as any).points)) clone.points = (e as any).points.map((p: any) => ({ x: p.x, y: p.y }));
  if ((e as any).center) clone.center = { x: (e as any).center.x, y: (e as any).center.y };
  if ((e as any).position) clone.position = { x: (e as any).position.x, y: (e as any).position.y };
  if ((e as any).p0) clone.p0 = { x: (e as any).p0.x, y: (e as any).p0.y };
  if ((e as any).p1) clone.p1 = { x: (e as any).p1.x, y: (e as any).p1.y };
  if ((e as any).p2) clone.p2 = { x: (e as any).p2.x, y: (e as any).p2.y };
  if ((e as any).p3) clone.p3 = { x: (e as any).p3.x, y: (e as any).p3.y };
  if ((e as any).size) clone.size = { w: (e as any).size.w, h: (e as any).size.h };
  if ((e as any).drill) clone.drill = { ...(e as any).drill, offset: (e as any).drill.offset ? { ...(e as any).drill.offset } : undefined };
  if (Array.isArray((e as any).layers)) clone.layers = [...(e as any).layers];
  return clone as T;
}

function patchEntityByTransform(entity: EntityModel, transform: SelectionTransform, pivot: Point): Partial<EntityModel> & Record<string, unknown> {
  if (transform.type === "translate") {
    const d = transform.delta;
    const dx = d.x;
    const dy = d.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return {};
    const out: any = {
      boundingBox: { ...entity.boundingBox, x: entity.boundingBox.x + dx, y: entity.boundingBox.y + dy }
    };

    if (entity.type === "TRACK") {
      const points = Array.isArray((entity as any).points) ? (entity as any).points : [];
      out.points = points.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
      out.boundingBox = boundsFromPolyline(out.points, (entity as any).width ?? 0);
      return out;
    }

    if (entity.type === "ARC_TRACK") {
      const c = (entity as any).center;
      if (c) out.center = { x: c.x + dx, y: c.y + dy };
      const r = Number((entity as any).radius) || 0;
      const w = Number((entity as any).width) || 0;
      out.boundingBox = boundsFromArc(out.center ?? c, r, (entity as any).startAngle ?? 0, (entity as any).endAngle ?? 0, (entity as any).clockwise === true, w);
      return out;
    }

    if (entity.type === "BEZIER_TRACK") {
      const b: any = entity as any;
      out.p0 = { x: b.p0.x + dx, y: b.p0.y + dy };
      out.p1 = { x: b.p1.x + dx, y: b.p1.y + dy };
      out.p2 = { x: b.p2.x + dx, y: b.p2.y + dy };
      out.p3 = { x: b.p3.x + dx, y: b.p3.y + dy };
      out.boundingBox = boundsFromPoints([out.p0, out.p1, out.p2, out.p3], (entity as any).width ?? 0);
      return out;
    }

    if (entity.type === "PAD") {
      const pos = (entity as any).position;
      if (pos) out.position = { x: pos.x + dx, y: pos.y + dy };
      out.transform = { ...entity.transform, e: entity.transform.e + dx, f: entity.transform.f + dy };
      out.boundingBox = boundsFromPad(out.position ?? pos, (entity as any).size, 0);
      return out;
    }

    if (entity.type === "VIA") {
      const pos = (entity as any).position;
      if (pos) out.position = { x: pos.x + dx, y: pos.y + dy };
      out.transform = { ...entity.transform, e: entity.transform.e + dx, f: entity.transform.f + dy };
      out.boundingBox = boundsFromCircle(out.position ?? pos, Number((entity as any).diameter) / 2 || 0, 0);
      return out;
    }

    out.transform = { ...entity.transform, e: entity.transform.e + dx, f: entity.transform.f + dy };
    return out;
  }

  if (transform.type === "rotate") {
    const angleRad = transform.angleRad;
    if (!Number.isFinite(angleRad) || angleRad === 0) return {};
    const out: any = {};

    if (entity.type === "TRACK") {
      const points = Array.isArray((entity as any).points) ? (entity as any).points : [];
      out.points = points.map((p: any) => rotatePoint({ x: p.x, y: p.y }, pivot, angleRad));
      out.boundingBox = boundsFromPolyline(out.points, (entity as any).width ?? 0);
      return out;
    }

    if (entity.type === "ARC_TRACK") {
      const c = (entity as any).center;
      if (c) out.center = rotatePoint({ x: c.x, y: c.y }, pivot, angleRad);
      out.startAngle = ((entity as any).startAngle ?? 0) + angleRad;
      out.endAngle = ((entity as any).endAngle ?? 0) + angleRad;
      const r = Number((entity as any).radius) || 0;
      const w = Number((entity as any).width) || 0;
      out.boundingBox = boundsFromArc(out.center ?? c, r, out.startAngle, out.endAngle, (entity as any).clockwise === true, w);
      return out;
    }

    if (entity.type === "BEZIER_TRACK") {
      const b: any = entity as any;
      out.p0 = rotatePoint(b.p0, pivot, angleRad);
      out.p1 = rotatePoint(b.p1, pivot, angleRad);
      out.p2 = rotatePoint(b.p2, pivot, angleRad);
      out.p3 = rotatePoint(b.p3, pivot, angleRad);
      out.boundingBox = boundsFromPoints([out.p0, out.p1, out.p2, out.p3], (entity as any).width ?? 0);
      return out;
    }

    if (entity.type === "PAD") {
      const pos = (entity as any).position;
      const nextPos = pos ? rotatePoint(pos, pivot, angleRad) : null;
      if (nextPos) out.position = nextPos;
      const rotation = Number((entity as any).rotation) || 0;
      out.rotation = rotation + (angleRad * 180) / Math.PI;
      if (nextPos) out.transform = transformFromPosAndRot(nextPos, out.rotation);
      out.boundingBox = boundsFromPad(nextPos ?? pos, (entity as any).size, out.rotation);
      return out;
    }

    if (entity.type === "VIA") {
      const pos = (entity as any).position;
      const nextPos = pos ? rotatePoint(pos, pivot, angleRad) : null;
      if (nextPos) out.position = nextPos;
      if (nextPos) out.transform = transformFromPosAndRot(nextPos, 0);
      out.boundingBox = boundsFromCircle(nextPos ?? pos, Number((entity as any).diameter) / 2 || 0, 0);
      return out;
    }

    return out;
  }

  const sx = transform.scaleX;
  const sy = transform.scaleY;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx === 0 || sy === 0) return {};
  const out: any = {};

  if (entity.type === "TRACK") {
    const points = Array.isArray((entity as any).points) ? (entity as any).points : [];
    out.points = points.map((p: any) => scalePoint({ x: p.x, y: p.y }, pivot, sx, sy));
    out.boundingBox = boundsFromPolyline(out.points, (entity as any).width ?? 0);
    return out;
  }

  if (entity.type === "ARC_TRACK") {
    const c = (entity as any).center;
    if (c) out.center = scalePoint({ x: c.x, y: c.y }, pivot, sx, sy);
    const r = Number((entity as any).radius) || 0;
    const w = Number((entity as any).width) || 0;
    const s = (Math.abs(sx) + Math.abs(sy)) / 2;
    out.radius = r * s;
    out.boundingBox = boundsFromArc(out.center ?? c, out.radius, (entity as any).startAngle ?? 0, (entity as any).endAngle ?? 0, (entity as any).clockwise === true, w);
    return out;
  }

  if (entity.type === "BEZIER_TRACK") {
    const b: any = entity as any;
    out.p0 = scalePoint(b.p0, pivot, sx, sy);
    out.p1 = scalePoint(b.p1, pivot, sx, sy);
    out.p2 = scalePoint(b.p2, pivot, sx, sy);
    out.p3 = scalePoint(b.p3, pivot, sx, sy);
    out.boundingBox = boundsFromPoints([out.p0, out.p1, out.p2, out.p3], (entity as any).width ?? 0);
    return out;
  }

  if (entity.type === "PAD") {
    const pos = (entity as any).position;
    const nextPos = pos ? scalePoint(pos, pivot, sx, sy) : null;
    if (nextPos) out.position = nextPos;
    const size = (entity as any).size;
    if (size) {
      const uniform = (Math.abs(sx) + Math.abs(sy)) / 2;
      if ((entity as any).shape === "circle") {
        out.size = { w: size.w * uniform, h: size.h * uniform };
      } else {
        out.size = { w: size.w * Math.abs(sx), h: size.h * Math.abs(sy) };
      }
    }
    if ((entity as any).drill?.diameter) {
      const uniform = (Math.abs(sx) + Math.abs(sy)) / 2;
      out.drill = { ...(entity as any).drill, diameter: (entity as any).drill.diameter * uniform };
    }
    const rotation = Number((entity as any).rotation) || 0;
    if (nextPos) out.transform = transformFromPosAndRot(nextPos, rotation);
    out.boundingBox = boundsFromPad(nextPos ?? pos, out.size ?? size, rotation);
    return out;
  }

  if (entity.type === "VIA") {
    const pos = (entity as any).position;
    const nextPos = pos ? scalePoint(pos, pivot, sx, sy) : null;
    if (nextPos) out.position = nextPos;
    const uniform = (Math.abs(sx) + Math.abs(sy)) / 2;
    out.diameter = (Number((entity as any).diameter) || 0) * uniform;
    out.drill = (Number((entity as any).drill) || 0) * uniform;
    if (nextPos) out.transform = transformFromPosAndRot(nextPos, 0);
    out.boundingBox = boundsFromCircle(nextPos ?? pos, out.diameter / 2 || 0, 0);
    return out;
  }

  return out;
}

function rotatePoint(p: Point, pivot: Point, angleRad: number): Point {
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

function scalePoint(p: Point, pivot: Point, sx: number, sy: number): Point {
  return { x: pivot.x + (p.x - pivot.x) * sx, y: pivot.y + (p.y - pivot.y) * sy };
}

function boundsFromPoints(points: Point[], pad: number): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const p2 = Math.max(0, pad) / 2;
  return { x: minX - p2, y: minY - p2, width: maxX - minX + p2 * 2, height: maxY - minY + p2 * 2 };
}

function boundsFromPolyline(points: Point[], width: number): Rect {
  return boundsFromPoints(points, Math.max(0, width));
}

function boundsFromCircle(center: Point | undefined, radius: number, width: number): Rect {
  if (!center) return { x: 0, y: 0, width: 0, height: 0 };
  const r = Math.max(0, radius) + Math.max(0, width) / 2;
  return { x: center.x - r, y: center.y - r, width: r * 2, height: r * 2 };
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

function boundsFromArc(
  center: Point | undefined,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  width: number
): Rect {
  if (!center) return { x: 0, y: 0, width: 0, height: 0 };
  const r = Math.max(0, radius);
  const pad = Math.max(0, width) / 2;

  const pushPoint = (angle: number, out: Point[]) => {
    out.push({ x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
  };

  const pts: Point[] = [];
  const PI2 = Math.PI * 2;
  const normalize = (v: number) => ((v % PI2) + PI2) % PI2;
  const s = normalize(startAngle);
  const e = normalize(endAngle);
  const eps = 1e-12;
  const sweep = clockwise
    ? ((e - s) % PI2 + PI2) % PI2
    : ((s - e) % PI2 + PI2) % PI2;
  if (sweep <= eps) return boundsFromCircle(center, r, width);

  pushPoint(startAngle, pts);
  pushPoint(endAngle, pts);
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const aa = normalize(a);
    const t = clockwise
      ? ((aa - s) % PI2 + PI2) % PI2
      : ((s - aa) % PI2 + PI2) % PI2;
    const inArc = t <= sweep + eps;
    if (inArc) pushPoint(a, pts);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 };
}

function boundsFromPad(pos: Point | undefined, size: { w: number; h: number } | undefined, _rotationDeg: number): Rect {
  if (!pos || !size) return { x: 0, y: 0, width: 0, height: 0 };
  const halfW = size.w / 2;
  const halfH = size.h / 2;
  const radius = Math.hypot(halfW, halfH);
  return { x: pos.x - radius, y: pos.y - radius, width: radius * 2, height: radius * 2 };
}

function transformFromPosAndRot(pos: Point, rotationDeg: number): Transform2D {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { a: c, b: s, c: -s, d: c, e: pos.x, f: pos.y };
}
