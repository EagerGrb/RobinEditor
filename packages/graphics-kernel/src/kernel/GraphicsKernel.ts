import type { DrawCommand } from "../view/drawCommands.js";
import { ViewGenerator } from "../view/ViewGenerator.js";
import type { Point, Rect, Transform2D } from "../math/types.js";
import { rectFromPoints, rectIntersects } from "../math/rect.js";
import { applyTransformToPoint, identityTransform, invertTransform } from "../math/transform.js";
import type { SceneModel } from "../model/models.js";
import { computeDimensionBoundingBox } from "../model/models.js";
import { SceneManager, type SceneChangeSet } from "../scene/SceneManager.js";
import { ToolChain } from "../tools/ToolChain.js";
import type { InputKeyEvent, InputPointerEvent, SelectionState, SnapOptions, SnapResult, ToolContext, ToolType } from "../tools/Tool.js";
import { DimensionTool } from "../tools/DimensionTool.js";
import { OpeningPlacementTool, type OpeningPlacementOptions } from "../tools/OpeningPlacementTool.js";
import { SelectionTool } from "../tools/SelectionTool.js";
import { WallDrawingTool } from "../tools/WallDrawingTool.js";
import type {
  GraphicsKernelEvent,
  GraphicsKernelEventHandler,
  IGraphicsKernel,
  SelectionTransform,
  SetToolParams
} from "./IGraphicsKernel.js";
import { findNearestEndpoint, findNearestWallProjection, snapToGrid } from "../geometry/snap.js";
import { pointToSegmentDistance } from "../geometry/segment.js";

export interface ICommand {
  execute(): void;
  undo(): void;
}

class CommandManager {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];

  constructor(private readonly limit: number) {}

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  executeCommand(cmd: ICommand): void {
    cmd.execute();
    this.recordExecutedCommand(cmd);
  }

  recordExecutedCommand(cmd: ICommand): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) {
      this.undoStack = this.undoStack.slice(this.undoStack.length - this.limit);
    }
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) {
      this.undoStack = this.undoStack.slice(this.undoStack.length - this.limit);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

class SnapshotSceneCommand implements ICommand {
  constructor(
    private readonly applySnapshot: (scene: SceneModel) => void,
    private readonly before: SceneModel,
    private readonly after: SceneModel,
  ) {}

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
  private historyLimit = 100;
  private commandManager = new CommandManager(this.historyLimit);

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
    walls: Map<string, { start: Point; end: Point }>;
    dimensions: Map<string, { points: Point[] }>;
    openings: Map<string, { wallId: string; position: number }>;
  } = {
    active: false,
    pointerId: null,
    startedGesture: false,
    pivot: null,
    walls: new Map(),
    dimensions: new Map(),
    openings: new Map()
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
    this.commandManager.reset();
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
    this.commandManager.reset();
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

    const nextWalls = new Map<string, { start: Point; end: Point }>();
    const nextDims = new Map<string, { points: Point[] }>();
    const nextOpenings = new Map<string, { wallId: string; position: number }>();

    let bounds: Rect | null = null;
    for (const id of this.selection.selectedIds) {
      const wall = baseline.walls.find((w) => w.id === id);
      if (wall) {
        nextWalls.set(id, { start: { ...wall.start }, end: { ...wall.end } });
        bounds = bounds ? rectUnionRects(bounds, wall.boundingBox) : wall.boundingBox;
        continue;
      }

      const dim = baseline.dimensions.find((d) => d.id === id);
      if (dim) {
        nextDims.set(id, { points: dim.points.map((p) => ({ x: p.x, y: p.y })) });
        bounds = bounds ? rectUnionRects(bounds, dim.boundingBox) : dim.boundingBox;
        continue;
      }

      const opening = baseline.openings.find((o) => o.id === id);
      if (opening) {
        nextOpenings.set(id, { wallId: opening.wallId, position: opening.position });
        bounds = bounds ? rectUnionRects(bounds, opening.boundingBox) : opening.boundingBox;
      }
    }

    if (!bounds) return;

    this.selectionTransform = {
      active: true,
      pointerId,
      startedGesture,
      pivot: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      walls: nextWalls,
      dimensions: nextDims,
      openings: nextOpenings
    };
  }

  updateSelectionTransform(transform: SelectionTransform): void {
    if (!this.selectionTransform.active) return;
    if (this.selection.selectedIds.size === 0) return;
    const pivot = ("pivot" in transform && transform.pivot ? transform.pivot : null) ?? this.selectionTransform.pivot;
    if (!pivot) return;

    const changesets: SceneChangeSet[] = [];
    const mergeThreshold = 1e-6;

    const applyPoint = (p: Point): Point => {
      if (transform.type === "translate") {
        return { x: p.x + transform.delta.x, y: p.y + transform.delta.y };
      }

      if (transform.type === "scale") {
        const sx = clampNumber(transform.scaleX, 1e-6, 1e6);
        const sy = clampNumber(transform.scaleY, 1e-6, 1e6);
        return {
          x: pivot.x + (p.x - pivot.x) * sx,
          y: pivot.y + (p.y - pivot.y) * sy
        };
      }

      const angle = transform.angleRad;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      return {
        x: pivot.x + dx * c - dy * s,
        y: pivot.y + dx * s + dy * c
      };
    };

    let hasChange = false;

    for (const [id, wall] of this.selectionTransform.walls) {
      const nextStart = applyPoint(wall.start);
      const nextEnd = applyPoint(wall.end);
      if (nextStart.x === wall.start.x && nextStart.y === wall.start.y && nextEnd.x === wall.end.x && nextEnd.y === wall.end.y) {
        continue;
      }
      hasChange = true;
      changesets.push(this.scene.updateWallEndpoints(id, nextStart, nextEnd, mergeThreshold));
    }

    for (const [id, dim] of this.selectionTransform.dimensions) {
      const nextPoints = dim.points.map(applyPoint);
      hasChange = true;
      changesets.push(this.scene.updateDimensionProperties(id, { points: nextPoints }));
    }

    if (transform.type === "translate") {
      const delta = transform.delta;
      for (const [id, opening] of this.selectionTransform.openings) {
        if (this.selectionTransform.walls.has(opening.wallId)) continue;
        const wallForOpening = this.scene.getWall(opening.wallId);
        if (!wallForOpening) continue;
        const len = Math.hypot(
          wallForOpening.end.x - wallForOpening.start.x,
          wallForOpening.end.y - wallForOpening.start.y
        );
        if (len <= 0) continue;
        const dir = {
          x: (wallForOpening.end.x - wallForOpening.start.x) / len,
          y: (wallForOpening.end.y - wallForOpening.start.y) / len
        };
        const deltaT = (delta.x * dir.x + delta.y * dir.y) / len;
        if (deltaT === 0) continue;
        hasChange = true;
        changesets.push(this.scene.updateOpeningPosition(id, opening.position + deltaT));
      }
    }

    if (!hasChange || changesets.length === 0) return;
    this.recordSceneMutation();
    const merged = mergeChangesets(changesets);
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
      walls: new Map(),
      dimensions: new Map(),
      openings: new Map()
    };
    if (shouldEndGesture) {
      this.endGestureForPointer(pointerId);
    }
  }

  setObjectProperties(id: string, patch: Record<string, unknown>): void {
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;

    if (id.startsWith("wall_")) {
      const metadata: Record<string, unknown> = {};
      const material = patch["material"];
      if (material != null) metadata["material"] = material;
      const changes = this.scene.updateWallProperties(id, {
        thickness: typeof patch["thickness"] === "number" ? (patch["thickness"] as number) : undefined,
        height: typeof patch["height"] === "number" ? (patch["height"] as number) : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      });
      if (changes.updated.length > 0 || changes.removed.length > 0 || changes.added.length > 0) {
        this.recordSceneMutation();
        if (baseline) {
          this.commandManager.recordExecutedCommand(
            new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
          );
        }
        this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
        this.recomputeDrawCommands();
      }
      return;
    }

    if (id.startsWith("opening_")) {
      const metadata: Record<string, unknown> = {};
      const swing = patch["swing"];
      if (swing != null) metadata["swing"] = swing;

      const openingType = patch["openingType"];
      const openingKindValue = patch["openingKind"];

      const openingKind =
        openingType === "door" || openingType === "window"
          ? openingType
          : openingKindValue === "door" || openingKindValue === "window"
            ? openingKindValue
            : undefined;

      const changes = this.scene.updateOpeningProperties(id, {
        openingKind,
        width: typeof patch["width"] === "number" ? (patch["width"] as number) : undefined,
        height: typeof patch["height"] === "number" ? (patch["height"] as number) : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      });
      if (changes.updated.length > 0 || changes.removed.length > 0 || changes.added.length > 0) {
        this.recordSceneMutation();
        if (baseline) {
          this.commandManager.recordExecutedCommand(
            new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
          );
        }
        this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
        this.recomputeDrawCommands();
      }
      return;
    }

    if (id.startsWith("dimension_")) {
      const metadata: Record<string, unknown> = {};
      const style = patch["style"];
      if (style != null) metadata["style"] = style;

      const changes = this.scene.updateDimensionProperties(id, {
        precision: typeof patch["precision"] === "number" ? (patch["precision"] as number) : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      });
      if (changes.updated.length > 0 || changes.removed.length > 0 || changes.added.length > 0) {
        this.recordSceneMutation();
        if (baseline) {
          this.commandManager.recordExecutedCommand(
            new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
          );
        }
        this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
        this.recomputeDrawCommands();
      }
    }
  }

  undo(): void {
    this.commandManager.undo();
  }

  redo(): void {
    this.commandManager.redo();
  }

  canUndo(): boolean {
    return this.commandManager.canUndo();
  }

  canRedo(): boolean {
    return this.commandManager.canRedo();
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
      const wall = this.scene.getWall(id);
      if (wall) {
        bounds = bounds ? rectUnionRects(bounds, wall.boundingBox) : wall.boundingBox;
        continue;
      }
      const opening = this.scene.getOpenings().find((o) => o.id === id);
      if (opening) {
        bounds = bounds ? rectUnionRects(bounds, opening.boundingBox) : opening.boundingBox;
        continue;
      }
      const dim = this.scene.getDimensions().find((d) => d.id === id);
      if (dim) {
        bounds = bounds ? rectUnionRects(bounds, dim.boundingBox) : dim.boundingBox;
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
      grid: this.scene.getGrid(),
      walls: this.scene.getWalls(),
      openings: this.scene.getOpenings(),
      dimensions: this.scene.getDimensions(),
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
      this.commandManager.recordExecutedCommand(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), this.gesture.baseline, this.scene.save()),
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
    if (this.scene.getWall(id)) return true;
    if (this.scene.getOpenings().some((o) => o.id === id)) return true;
    if (this.scene.getDimensions().some((d) => d.id === id)) return true;
    return false;
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
      hitTestRect: (rect: Rect): string[] => this.hitTestRect(rect),
      translateSelected: (delta: Point) => {
        this.translateSelected(delta);
      },
      deleteSelection: () => {
        this.deleteSelection();
      },
      addWallPolyline: (points: Point[]) => {
        this.addWallPolyline(points);
      },
      addOpeningAt: (wallId, position, kind, size) => {
        this.addOpeningAt(wallId, position, kind, size);
      },
      addDimension: (points) => {
        this.addDimension(points);
      },
      setEphemeralDrawCommands: (commands) => {
        this.ephemeral = commands;
      }
    };
  }

  private createTool(params: SetToolParams) {
    if (params.type === "selection") return new SelectionTool();
    if (params.type === "wallDrawing") return new WallDrawingTool();
    if (params.type === "dimension") return new DimensionTool();
    if (params.type === "openingPlacement") {
      const opts: OpeningPlacementOptions = {
        kind: params.kind,
        width: params.width,
        height: params.height
      };
      return new OpeningPlacementTool(opts);
    }
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
    const candidates: Array<{ kindOrder: number; candidate: ReturnType<typeof findNearestEndpoint> } | null> = [];

    let best: { kindOrder: number; candidate: any } | null = null;

    if (options.enableGrid) {
      const gp = snapToGrid(p, this.scene.getGrid().spacing);
      const dist = Math.hypot(gp.x - p.x, gp.y - p.y);
      if (dist <= thresholdWorld) {
        best = {
          kindOrder: 2,
          candidate: { kind: "grid", point: gp, distance: dist }
        };
      }
    }

    if (options.enableEndpoints) {
      const endpoint = findNearestEndpoint(p, this.scene.getWallEndpoints());
      if (endpoint && endpoint.distance <= thresholdWorld) {
        best = pickBetter(best, { kindOrder: 0, candidate: endpoint });
      }
    }

    if (options.enableWalls) {
      const wall = findNearestWallProjection(p, this.scene.getWalls());
      if (wall && wall.distance <= thresholdWorld) {
        best = pickBetter(best, { kindOrder: 1, candidate: wall });
      }
    }

    if (!best) return { point: p, candidate: null };
    return { point: best.candidate.point, candidate: best.candidate };
  }

  private hitTestPoint(p: Point, thresholdPx: number): string | null {
    const thresholdWorld = this.thresholdWorldFromPx(thresholdPx);

    let bestId: string | null = null;
    let bestMetric = Infinity;

    for (const opening of this.scene.getOpenings()) {
      const r = inflateRect(opening.boundingBox, thresholdWorld);
      if (!rectContainsPoint(r, p)) continue;
      const cx = opening.boundingBox.x + opening.boundingBox.width / 2;
      const cy = opening.boundingBox.y + opening.boundingBox.height / 2;
      const metric = Math.hypot(p.x - cx, p.y - cy);
      if (metric < bestMetric) {
        bestMetric = metric;
        bestId = opening.id;
      }
    }

    for (const wall of this.scene.getWalls()) {
      const res = pointToSegmentDistance(p, wall.start, wall.end);
      const hitThreshold = thresholdWorld + wall.thickness / 2;
      if (res.distance <= hitThreshold && res.distance < bestMetric) {
        bestMetric = res.distance;
        bestId = wall.id;
      }
    }

    for (const dim of this.scene.getDimensions()) {
      const r = inflateRect(dim.boundingBox, thresholdWorld);
      if (!rectContainsPoint(r, p)) continue;
      const metric = 0.5;
      if (metric < bestMetric) {
        bestMetric = metric;
        bestId = dim.id;
      }
    }

    return bestId;
  }

  private hitTestRect(rect: Rect): string[] {
    const hits: string[] = [];
    for (const shape of this.scene.getAllShapes()) {
      if (shape.type === "grid") continue;
      if (rectIntersects(rect, shape.boundingBox)) {
        hits.push(shape.id);
      }
    }
    return hits;
  }

  private addWallPolyline(points: Point[]): void {
    if (points.length < 2) return;
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    this.recordSceneMutation();
    const changes = mergeChangesets(
      points.slice(0, -1).map((p, i) => {
        const next = points[i + 1]!;
        return this.scene.addWall(p, next).changes;
      })
    );

    if (baseline && (changes.added.length > 0 || changes.updated.length > 0 || changes.removed.length > 0)) {
      this.commandManager.recordExecutedCommand(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
      );
    }
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes });
  }

  private addOpeningAt(wallId: string, position: number, kind: "door" | "window", size: { width: number; height: number }): void {
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    this.recordSceneMutation();
    const res = this.scene.addOpening({
      openingKind: kind,
      wallId,
      position,
      width: size.width,
      height: size.height
    });

    if (baseline && (res.changes.added.length > 0 || res.changes.updated.length > 0 || res.changes.removed.length > 0)) {
      this.commandManager.recordExecutedCommand(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
      );
    }
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: res.changes });
  }

  private addDimension(points: Point[]): void {
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    this.recordSceneMutation();
    const res = this.scene.addDimension(points);

    if (baseline && (res.changes.added.length > 0 || res.changes.updated.length > 0 || res.changes.removed.length > 0)) {
      this.commandManager.recordExecutedCommand(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
      );
    }
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: res.changes });
  }

  private translateSelected(delta: Point): void {
    if (delta.x === 0 && delta.y === 0) return;
    if (this.selection.selectedIds.size === 0) return;

    let hasMoveTarget = false;
    for (const id of this.selection.selectedIds) {
      if (this.scene.getWall(id)) {
        hasMoveTarget = true;
        break;
      }
      const opening = this.scene.getOpenings().find((o) => o.id === id);
      if (opening) {
        const wallForOpening = this.scene.getWall(opening.wallId);
        if (wallForOpening) {
          const len = Math.hypot(wallForOpening.end.x - wallForOpening.start.x, wallForOpening.end.y - wallForOpening.start.y);
          if (len > 0) {
            hasMoveTarget = true;
            break;
          }
        }
      }
      const dim = this.scene.getDimensions().find((d) => d.id === id);
      if (dim) {
        hasMoveTarget = true;
        break;
      }
    }
    if (!hasMoveTarget) return;

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    this.recordSceneMutation();

    const threshold = this.thresholdWorldFromPx(10);
    const changesets: SceneChangeSet[] = [];

    for (const id of this.selection.selectedIds) {
      const wall = this.scene.getWall(id);
      if (wall) {
        changesets.push(
          this.scene.updateWallEndpoints(
            id,
            { x: wall.start.x + delta.x, y: wall.start.y + delta.y },
            { x: wall.end.x + delta.x, y: wall.end.y + delta.y },
            threshold
          )
        );
        continue;
      }

      const opening = this.scene.getOpenings().find((o) => o.id === id);
      if (opening) {
        const wallForOpening = this.scene.getWall(opening.wallId);
        if (!wallForOpening) continue;
        const len = Math.hypot(wallForOpening.end.x - wallForOpening.start.x, wallForOpening.end.y - wallForOpening.start.y);
        if (len <= 0) continue;
        const dir = {
          x: (wallForOpening.end.x - wallForOpening.start.x) / len,
          y: (wallForOpening.end.y - wallForOpening.start.y) / len
        };
        const deltaT = (delta.x * dir.x + delta.y * dir.y) / len;
        changesets.push(this.scene.updateOpeningPosition(opening.id, opening.position + deltaT));
        continue;
      }

      const dim = this.scene.getDimensions().find((d) => d.id === id);
      if (dim) {
        const before = dim.boundingBox;
        dim.points = dim.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
        dim.boundingBox = computeDimensionBoundingBox(dim.points);
        changesets.push({
          added: [],
          updated: [dim.id],
          removed: [],
          affectedBounds: [rectUnionRects(before, dim.boundingBox)]
        });
      }
    }

    if (changesets.length > 0) {
      const merged = mergeChangesets(changesets);

      if (baseline && (merged.added.length > 0 || merged.updated.length > 0 || merged.removed.length > 0)) {
        this.commandManager.recordExecutedCommand(
          new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
        );
      }
      this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    }
  }

  private deleteSelection(): void {
    if (this.selection.selectedIds.size === 0) return;

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    this.recordSceneMutation();
    const changesets: SceneChangeSet[] = [];
    for (const id of this.selection.selectedIds) {
      changesets.push(this.scene.deleteShape(id));
    }
    this.selection.selectedIds.clear();
    this.emitSelection();
    const merged = mergeChangesets(changesets);

    if (baseline && (merged.added.length > 0 || merged.updated.length > 0 || merged.removed.length > 0)) {
      this.commandManager.recordExecutedCommand(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save()),
      );
    }
    this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
  }
}

function pickBetter(
  a: { kindOrder: number; candidate: any } | null,
  b: { kindOrder: number; candidate: any }
): { kindOrder: number; candidate: any } {
  if (!a) return b;
  if (b.candidate.distance < a.candidate.distance) return b;
  if (b.candidate.distance > a.candidate.distance) return a;
  if (b.kindOrder < a.kindOrder) return b;
  return a;
}

function inflateRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}

function clampNumber(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
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
  return { added: Array.from(added), updated: Array.from(updated), removed: Array.from(removed), affectedBounds };
}

function rectUnionRects(a: Rect, b: Rect): Rect {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
