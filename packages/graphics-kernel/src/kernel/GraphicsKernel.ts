import type { DrawCommand } from "../view/drawCommands.js";
import { ViewGenerator } from "../view/ViewGenerator.js";
import type { Point, Rect, Transform2D } from "../math/types.js";
import { rectFromPoints, rectUnion } from "../math/rect.js";
import { applyTransformToPoint, identityTransform, invertTransform } from "../math/transform.js";
import type { SceneModel, EntityModel } from "../model/models.js";
import { SceneManager, type SceneChangeSet } from "../scene/SceneManager.js";
import { createId } from "../scene/id.js";
import { ToolManager } from "./tools/ToolManager.js";
import type { InputKeyEvent, InputPointerEvent, SelectionState, SnapOptions, SnapResult, ToolContext, ToolType } from "../tools/Tool.js";
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
    entities: Map<string, EntityModel>;
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

  private toolManager = new ToolManager();

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
    this.toolManager.setTool(params.type, this.toolContext());
    this.ephemeral = [];
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
    
    if (normalized.type === "pointerdown") {
      this.toolManager.onPointerDown(normalized, this.toolContext());
    } else if (normalized.type === "pointermove") {
      this.toolManager.onPointerMove(normalized, this.toolContext());
    } else if (normalized.type === "pointerup") {
      this.toolManager.onPointerUp(normalized, this.toolContext());
    }
    
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
    // ToolManager does not support onKeyUp currently
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
        nextEntities.set(id, {
          ...(entity as any),
          transform: { ...entity.transform },
          boundingBox: { ...entity.boundingBox },
          metadata: { ...(entity.metadata ?? {}) },
          position: (entity as any).position ? { ...(entity as any).position } : undefined,
          size: (entity as any).size ? { ...(entity as any).size } : undefined,
          points: Array.isArray((entity as any).points)
            ? (entity as any).points.map((p: any) => ({ x: p.x, y: p.y }))
            : undefined
        } as any);
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
    if (!this.selectionTransform.active) return;
    if (this.selection.selectedIds.size === 0) return;

    const baselineEntities = this.selectionTransform.entities;
    if (baselineEntities.size === 0) return;

    const pivot =
      transform.type === "rotate" || transform.type === "scale"
        ? transform.pivot ?? this.selectionTransform.pivot
        : this.selectionTransform.pivot;
    if (!pivot) return;

    const changesets: SceneChangeSet[] = [];

    if (transform.type === "translate") {
      const delta = transform.delta;
      for (const id of this.selection.selectedIds) {
        const base = baselineEntities.get(id);
        if (!base) continue;

        const patch: any = {};

        if (base.type === "TRACK" && Array.isArray((base as any).points)) {
          const points: Point[] = (base as any).points;
          const nextPoints = points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
          const width = typeof (base as any).width === "number" ? (base as any).width : 1;
          patch.points = nextPoints;
          patch.transform = identityTransform();
          patch.boundingBox = trackBounds(nextPoints, width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if (base.type === "ARC_TRACK" && (base as any).center && typeof (base as any).radius === "number") {
          const c0 = (base as any).center as Point;
          const nextCenter = { x: c0.x + delta.x, y: c0.y + delta.y };
          const radius = (base as any).radius as number;
          const startAngle = (base as any).startAngle as number;
          const endAngle = (base as any).endAngle as number;
          const clockwise = !!(base as any).clockwise;
          const width = typeof (base as any).width === "number" ? (base as any).width : 1;
          patch.center = nextCenter;
          patch.transform = identityTransform();
          patch.boundingBox = arcBounds(nextCenter, radius, startAngle, endAngle, clockwise, width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if (base.type === "BEZIER_TRACK" && (base as any).p0 && (base as any).p3) {
          const p0 = (base as any).p0 as Point;
          const p1 = (base as any).p1 as Point;
          const p2 = (base as any).p2 as Point;
          const p3 = (base as any).p3 as Point;
          const next = {
            p0: { x: p0.x + delta.x, y: p0.y + delta.y },
            p1: { x: p1.x + delta.x, y: p1.y + delta.y },
            p2: { x: p2.x + delta.x, y: p2.y + delta.y },
            p3: { x: p3.x + delta.x, y: p3.y + delta.y }
          };
          const width = typeof (base as any).width === "number" ? (base as any).width : 1;
          patch.p0 = next.p0;
          patch.p1 = next.p1;
          patch.p2 = next.p2;
          patch.p3 = next.p3;
          patch.transform = identityTransform();
          patch.boundingBox = bezierBounds([next.p0, next.p1, next.p2, next.p3], width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if ((base as any).position) {
          const pos = (base as any).position as Point;
          const nextPos = { x: pos.x + delta.x, y: pos.y + delta.y };
          patch.position = nextPos;

          const rotDeg = typeof (base as any).rotation === "number" ? (base as any).rotation : 0;
          const rad = (rotDeg * Math.PI) / 180;
          const c = Math.cos(rad);
          const s = Math.sin(rad);
          patch.transform = { a: c, b: s, c: -s, d: c, e: nextPos.x, f: nextPos.y };

          if (base.type === "PAD" && (base as any).size) {
            const w = (base as any).size.w as number;
            const h = (base as any).size.h as number;
            const radius = Math.hypot(w / 2, h / 2);
            patch.boundingBox = { x: nextPos.x - radius, y: nextPos.y - radius, width: radius * 2, height: radius * 2 };
          } else if (base.type === "VIA" && typeof (base as any).diameter === "number") {
            const r = (base as any).diameter / 2;
            patch.boundingBox = { x: nextPos.x - r, y: nextPos.y - r, width: r * 2, height: r * 2 };
          } else {
            patch.boundingBox = {
              x: nextPos.x - base.boundingBox.width / 2,
              y: nextPos.y - base.boundingBox.height / 2,
              width: base.boundingBox.width,
              height: base.boundingBox.height
            };
          }
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        patch.transform = { ...base.transform, e: base.transform.e + delta.x, f: base.transform.f + delta.y };
        patch.boundingBox = { ...base.boundingBox, x: base.boundingBox.x + delta.x, y: base.boundingBox.y + delta.y };
        changesets.push(this.scene.updateEntity(id, patch));
      }
    } else if (transform.type === "rotate") {
      const angle = transform.angleRad;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const angleDeg = (angle * 180) / Math.PI;

      for (const id of this.selection.selectedIds) {
        const base = baselineEntities.get(id);
        if (!base) continue;

        const patch: any = {};

        if (base.type === "TRACK" && Array.isArray((base as any).points)) {
          const points: Point[] = (base as any).points;
          const nextPoints = points.map((p) => ({
            x: pivot.x + (p.x - pivot.x) * cos - (p.y - pivot.y) * sin,
            y: pivot.y + (p.x - pivot.x) * sin + (p.y - pivot.y) * cos
          }));
          const width = typeof (base as any).width === "number" ? (base as any).width : 1;
          patch.points = nextPoints;
          patch.transform = identityTransform();
          patch.boundingBox = trackBounds(nextPoints, width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if (base.type === "ARC_TRACK" && (base as any).center && typeof (base as any).radius === "number") {
          const c0 = (base as any).center as Point;
          const nextCenter = {
            x: pivot.x + (c0.x - pivot.x) * cos - (c0.y - pivot.y) * sin,
            y: pivot.y + (c0.x - pivot.x) * sin + (c0.y - pivot.y) * cos
          };
          const radius = (base as any).radius as number;
          const startAngle = ((base as any).startAngle as number) + angle;
          const endAngle = ((base as any).endAngle as number) + angle;
          const clockwise = !!(base as any).clockwise;
          const width = typeof (base as any).width === "number" ? (base as any).width : 1;
          patch.center = nextCenter;
          patch.startAngle = startAngle;
          patch.endAngle = endAngle;
          patch.transform = identityTransform();
          patch.boundingBox = arcBounds(nextCenter, radius, startAngle, endAngle, clockwise, width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if (base.type === "BEZIER_TRACK" && (base as any).p0 && (base as any).p3) {
          const rot = (p: Point) => ({
            x: pivot.x + (p.x - pivot.x) * cos - (p.y - pivot.y) * sin,
            y: pivot.y + (p.x - pivot.x) * sin + (p.y - pivot.y) * cos
          });
          const p0 = rot((base as any).p0 as Point);
          const p1 = rot((base as any).p1 as Point);
          const p2 = rot((base as any).p2 as Point);
          const p3 = rot((base as any).p3 as Point);
          const width = typeof (base as any).width === "number" ? (base as any).width : 1;
          patch.p0 = p0;
          patch.p1 = p1;
          patch.p2 = p2;
          patch.p3 = p3;
          patch.transform = identityTransform();
          patch.boundingBox = bezierBounds([p0, p1, p2, p3], width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if ((base as any).position) {
          const pos = (base as any).position as Point;
          const nextPos = {
            x: pivot.x + (pos.x - pivot.x) * cos - (pos.y - pivot.y) * sin,
            y: pivot.y + (pos.x - pivot.x) * sin + (pos.y - pivot.y) * cos
          };
          patch.position = nextPos;

          if (typeof (base as any).rotation === "number") {
            patch.rotation = ((base as any).rotation + angleDeg) % 360;
          }

          const rotDeg = typeof patch.rotation === "number" ? patch.rotation : 0;
          const rad = (rotDeg * Math.PI) / 180;
          const c = Math.cos(rad);
          const s = Math.sin(rad);
          patch.transform = { a: c, b: s, c: -s, d: c, e: nextPos.x, f: nextPos.y };

          if (base.type === "PAD" && (base as any).size) {
            const w = (base as any).size.w as number;
            const h = (base as any).size.h as number;
            const radius = Math.hypot(w / 2, h / 2);
            patch.boundingBox = { x: nextPos.x - radius, y: nextPos.y - radius, width: radius * 2, height: radius * 2 };
          } else if (base.type === "VIA" && typeof (base as any).diameter === "number") {
            const r = (base as any).diameter / 2;
            patch.boundingBox = { x: nextPos.x - r, y: nextPos.y - r, width: r * 2, height: r * 2 };
          } else {
            patch.boundingBox = {
              x: nextPos.x - base.boundingBox.width / 2,
              y: nextPos.y - base.boundingBox.height / 2,
              width: base.boundingBox.width,
              height: base.boundingBox.height
            };
          }

          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        const center = { x: base.transform.e, y: base.transform.f };
        const nextCenter = {
          x: pivot.x + (center.x - pivot.x) * cos - (center.y - pivot.y) * sin,
          y: pivot.y + (center.x - pivot.x) * sin + (center.y - pivot.y) * cos
        };
        patch.transform = { ...base.transform, e: nextCenter.x, f: nextCenter.y };
        patch.boundingBox = {
          x: nextCenter.x - base.boundingBox.width / 2,
          y: nextCenter.y - base.boundingBox.height / 2,
          width: base.boundingBox.width,
          height: base.boundingBox.height
        };
        changesets.push(this.scene.updateEntity(id, patch));
      }
    } else if (transform.type === "scale") {
      const sx = transform.scaleX;
      const sy = transform.scaleY;
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx === 0 || sy === 0) return;

      for (const id of this.selection.selectedIds) {
        const base = baselineEntities.get(id);
        if (!base) continue;

        const patch: any = {};

        if (base.type === "TRACK" && Array.isArray((base as any).points)) {
          const points: Point[] = (base as any).points;
          const nextPoints = points.map((p) => ({
            x: pivot.x + (p.x - pivot.x) * sx,
            y: pivot.y + (p.y - pivot.y) * sy
          }));
          const width0 = typeof (base as any).width === "number" ? (base as any).width : 1;
          const sAvg = (Math.abs(sx) + Math.abs(sy)) / 2;
          const width = Math.max(0.001, width0 * sAvg);
          patch.points = nextPoints;
          patch.width = width;
          patch.transform = identityTransform();
          patch.boundingBox = trackBounds(nextPoints, width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if (base.type === "ARC_TRACK" && (base as any).center && typeof (base as any).radius === "number") {
          const c0 = (base as any).center as Point;
          const nextCenter = { x: pivot.x + (c0.x - pivot.x) * sx, y: pivot.y + (c0.y - pivot.y) * sy };
          const sAvg = (Math.abs(sx) + Math.abs(sy)) / 2;
          const radius = Math.max(0.001, ((base as any).radius as number) * sAvg);
          const width0 = typeof (base as any).width === "number" ? (base as any).width : 1;
          const width = Math.max(0.001, width0 * sAvg);
          const startAngle = (base as any).startAngle as number;
          const endAngle = (base as any).endAngle as number;
          const clockwise = !!(base as any).clockwise;
          patch.center = nextCenter;
          patch.radius = radius;
          patch.width = width;
          patch.transform = identityTransform();
          patch.boundingBox = arcBounds(nextCenter, radius, startAngle, endAngle, clockwise, width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if (base.type === "BEZIER_TRACK" && (base as any).p0 && (base as any).p3) {
          const scalePoint = (p: Point) => ({ x: pivot.x + (p.x - pivot.x) * sx, y: pivot.y + (p.y - pivot.y) * sy });
          const p0 = scalePoint((base as any).p0 as Point);
          const p1 = scalePoint((base as any).p1 as Point);
          const p2 = scalePoint((base as any).p2 as Point);
          const p3 = scalePoint((base as any).p3 as Point);
          const sAvg = (Math.abs(sx) + Math.abs(sy)) / 2;
          const width0 = typeof (base as any).width === "number" ? (base as any).width : 1;
          const width = Math.max(0.001, width0 * sAvg);
          patch.p0 = p0;
          patch.p1 = p1;
          patch.p2 = p2;
          patch.p3 = p3;
          patch.width = width;
          patch.transform = identityTransform();
          patch.boundingBox = bezierBounds([p0, p1, p2, p3], width);
          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }

        if ((base as any).position) {
          const pos = (base as any).position as Point;
          const nextPos = { x: pivot.x + (pos.x - pivot.x) * sx, y: pivot.y + (pos.y - pivot.y) * sy };
          patch.position = nextPos;

          const rotDeg = typeof (base as any).rotation === "number" ? (base as any).rotation : 0;
          const rad = (rotDeg * Math.PI) / 180;
          const c = Math.cos(rad);
          const s = Math.sin(rad);
          patch.transform = { a: c, b: s, c: -s, d: c, e: nextPos.x, f: nextPos.y };

          if (base.type === "PAD" && (base as any).size) {
            const w0 = (base as any).size.w as number;
            const h0 = (base as any).size.h as number;
            const w = Math.max(0.001, Math.abs(w0 * sx));
            const h = Math.max(0.001, Math.abs(h0 * sy));
            patch.size = { w, h };
            const radius = Math.hypot(w / 2, h / 2);
            patch.boundingBox = { x: nextPos.x - radius, y: nextPos.y - radius, width: radius * 2, height: radius * 2 };
          } else if (base.type === "VIA" && typeof (base as any).diameter === "number") {
            const sAvg = (Math.abs(sx) + Math.abs(sy)) / 2;
            const diameter = Math.max(0.001, (base as any).diameter * sAvg);
            const drill = typeof (base as any).drill === "number" ? Math.max(0.001, (base as any).drill * sAvg) : undefined;
            patch.diameter = diameter;
            if (drill != null) patch.drill = drill;
            const r = diameter / 2;
            patch.boundingBox = { x: nextPos.x - r, y: nextPos.y - r, width: diameter, height: diameter };
          } else {
            patch.boundingBox = {
              x: nextPos.x - base.boundingBox.width / 2,
              y: nextPos.y - base.boundingBox.height / 2,
              width: base.boundingBox.width,
              height: base.boundingBox.height
            };
          }

          changesets.push(this.scene.updateEntity(id, patch));
          continue;
        }
      }
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

  setEphemeralDrawCommands(commands: DrawCommand[]): void {
    this.ephemeral = commands;
    this.recomputeDrawCommands();
  }

  setGhostEntity(entity: EntityModel | null): void {
    this.ghostEntity = entity;
    this.recomputeDrawCommands();
  }

  pasteEntities(templates: EntityModel[], options: { offset: Point; label?: string; select?: boolean }): string[] {
    const offset = options.offset;
    if (!offset || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return [];
    if (!Array.isArray(templates) || templates.length === 0) return [];

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    const changesets: SceneChangeSet[] = [];
    const newIds: string[] = [];

    for (const t of templates) {
      if (!t || typeof t.type !== "string") continue;
      const next = cloneEntityTemplate(t);
      next.id = createId(idPrefixForEntityType(next.type));
      translateEntityInPlace(next as any, offset);
      changesets.push(this.scene.addEntity(next));
      newIds.push(next.id);
    }

    if (newIds.length === 0) return [];

    if (options.select !== false) {
      this.selection.selectedIds = new Set(newIds);
      this.emitSelection();
    }

    const merged = mergeChangesets(changesets);
    this.recordSceneMutation();
    if (merged.added.length || merged.updated.length || merged.removed.length) {
      this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: merged });
    }
    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), options.label ?? "Paste"),
      );
    }

    return newIds;
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
      ephemeral: this.ephemeral,
      ghostEntity: this.ghostEntity
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
      rotateSelected: (angleDegrees: number) => {
        this.rotateSelected(angleDegrees);
      },
      deleteSelection: () => {
        this.deleteSelection();
      },
      addEntity: (entity: EntityModel) => {
        this.addEntity(entity);
      },
      setEphemeralDrawCommands: (commands) => {
        this.ephemeral = commands;
      },
      setGhostEntity: (entity) => {
        this.setGhostEntity(entity);
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

      const patch: any = {};

      if ((entity as any).position && typeof (entity as any).position.x === "number" && typeof (entity as any).position.y === "number") {
        patch.position = { x: (entity as any).position.x + delta.x, y: (entity as any).position.y + delta.y } as any;
      }

      if (entity.type === "TRACK" && Array.isArray((entity as any).points)) {
        const points: Point[] = (entity as any).points;
        const worldPoints = points.map((p) => applyTransformToPoint(entity.transform, p));
        const nextPoints = worldPoints.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
        const width = typeof (entity as any).width === "number" ? (entity as any).width : 1;
        patch.points = nextPoints as any;
        patch.transform = identityTransform();
        patch.boundingBox = trackBounds(nextPoints, width) as any;
      } else if (entity.type === "ARC_TRACK" && (entity as any).center && typeof (entity as any).radius === "number") {
        const center = (entity as any).center as Point;
        const nextCenter = { x: center.x + delta.x, y: center.y + delta.y };
        const radius = (entity as any).radius as number;
        const startAngle = (entity as any).startAngle as number;
        const endAngle = (entity as any).endAngle as number;
        const clockwise = !!(entity as any).clockwise;
        const width = typeof (entity as any).width === "number" ? (entity as any).width : 1;
        patch.center = nextCenter as any;
        patch.transform = identityTransform();
        patch.boundingBox = arcBounds(nextCenter, radius, startAngle, endAngle, clockwise, width) as any;
      } else if (entity.type === "BEZIER_TRACK" && (entity as any).p0 && (entity as any).p3) {
        const p0 = (entity as any).p0 as Point;
        const p1 = (entity as any).p1 as Point;
        const p2 = (entity as any).p2 as Point;
        const p3 = (entity as any).p3 as Point;
        const next = {
          p0: { x: p0.x + delta.x, y: p0.y + delta.y },
          p1: { x: p1.x + delta.x, y: p1.y + delta.y },
          p2: { x: p2.x + delta.x, y: p2.y + delta.y },
          p3: { x: p3.x + delta.x, y: p3.y + delta.y }
        };
        const width = typeof (entity as any).width === "number" ? (entity as any).width : 1;
        patch.p0 = next.p0 as any;
        patch.p1 = next.p1 as any;
        patch.p2 = next.p2 as any;
        patch.p3 = next.p3 as any;
        patch.transform = identityTransform();
        patch.boundingBox = bezierBounds([next.p0, next.p1, next.p2, next.p3], width) as any;
      } else {
        patch.transform = { ...entity.transform, e: entity.transform.e + delta.x, f: entity.transform.f + delta.y };
        patch.boundingBox = { ...entity.boundingBox, x: entity.boundingBox.x + delta.x, y: entity.boundingBox.y + delta.y };
      }

      changesets.push(this.scene.updateEntity(id, patch));
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

  private rotateSelected(angleDegrees: number): void {
    if (angleDegrees === 0) return;
    if (this.selection.selectedIds.size === 0) return;

    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    const changesets: SceneChangeSet[] = [];

    const bounds = this.getSelectionBounds();
    if (!bounds) return;

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (const id of this.selection.selectedIds) {
      const entity = this.scene.getEntity(id);
      if (!entity) continue;

      const patch: any = {};

      if (entity.type === "TRACK" && Array.isArray((entity as any).points)) {
        const points: Point[] = (entity as any).points;
        const worldPoints = points.map((p) => applyTransformToPoint(entity.transform, p));
        const nextPoints = worldPoints.map((p) => ({
          x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
          y: cy + (p.x - cx) * sin + (p.y - cy) * cos
        }));
        const width = typeof (entity as any).width === "number" ? (entity as any).width : 1;
        patch.points = nextPoints as any;
        patch.transform = identityTransform();
        patch.boundingBox = trackBounds(nextPoints, width) as any;
        changesets.push(this.scene.updateEntity(id, patch));
        continue;
      }

      if (entity.type === "ARC_TRACK" && (entity as any).center && typeof (entity as any).radius === "number") {
        const center = (entity as any).center as Point;
        const nextCenter = {
          x: cx + (center.x - cx) * cos - (center.y - cy) * sin,
          y: cy + (center.x - cx) * sin + (center.y - cy) * cos
        };
        const radius = (entity as any).radius as number;
        const startAngle = ((entity as any).startAngle as number) + rad;
        const endAngle = ((entity as any).endAngle as number) + rad;
        const clockwise = !!(entity as any).clockwise;
        const width = typeof (entity as any).width === "number" ? (entity as any).width : 1;
        patch.center = nextCenter as any;
        patch.startAngle = startAngle as any;
        patch.endAngle = endAngle as any;
        patch.transform = identityTransform();
        patch.boundingBox = arcBounds(nextCenter, radius, startAngle, endAngle, clockwise, width) as any;
        changesets.push(this.scene.updateEntity(id, patch));
        continue;
      }

      if (entity.type === "BEZIER_TRACK" && (entity as any).p0 && (entity as any).p3) {
        const rotPoint = (p: Point) => ({
          x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
          y: cy + (p.x - cx) * sin + (p.y - cy) * cos
        });
        const p0 = rotPoint((entity as any).p0 as Point);
        const p1 = rotPoint((entity as any).p1 as Point);
        const p2 = rotPoint((entity as any).p2 as Point);
        const p3 = rotPoint((entity as any).p3 as Point);
        const width = typeof (entity as any).width === "number" ? (entity as any).width : 1;
        patch.p0 = p0 as any;
        patch.p1 = p1 as any;
        patch.p2 = p2 as any;
        patch.p3 = p3 as any;
        patch.transform = identityTransform();
        patch.boundingBox = bezierBounds([p0, p1, p2, p3], width) as any;
        changesets.push(this.scene.updateEntity(id, patch));
        continue;
      }

      const center = applyTransformToPoint(entity.transform, { x: 0, y: 0 });
      const nextCenter = {
        x: cx + (center.x - cx) * cos - (center.y - cy) * sin,
        y: cy + (center.x - cx) * sin + (center.y - cy) * cos
      };

      const prevRot = typeof (entity as any).rotation === "number" ? (entity as any).rotation : 0;
      const nextRot = (prevRot + angleDegrees) % 360;

      if ((entity as any).position && typeof (entity as any).position.x === "number" && typeof (entity as any).position.y === "number") {
        patch.position = nextCenter as any;
      }
      if (typeof (entity as any).rotation === "number" && (entity.type === "PAD" || entity.type === "FOOTPRINT" || entity.type === "TEXT")) {
        patch.rotation = nextRot as any;
      }

      const useRot = entity.type === "PAD" || entity.type === "FOOTPRINT" || entity.type === "TEXT" ? nextRot : 0;
      const rRad = (useRot * Math.PI) / 180;
      const rc = Math.cos(rRad);
      const rs = Math.sin(rRad);
      patch.transform = { a: rc, b: rs, c: -rs, d: rc, e: nextCenter.x, f: nextCenter.y };

      if (entity.type === "PAD" && (entity as any).size) {
        const w = typeof (entity as any).size.w === "number" ? (entity as any).size.w : entity.boundingBox.width;
        const h = typeof (entity as any).size.h === "number" ? (entity as any).size.h : entity.boundingBox.height;
        const radius = Math.hypot(w / 2, h / 2);
        patch.boundingBox = { x: nextCenter.x - radius, y: nextCenter.y - radius, width: radius * 2, height: radius * 2 };
      } else if (entity.type === "VIA" && typeof (entity as any).diameter === "number") {
        const r = (entity as any).diameter / 2;
        patch.boundingBox = { x: nextCenter.x - r, y: nextCenter.y - r, width: r * 2, height: r * 2 };
      } else {
        patch.boundingBox = {
          x: nextCenter.x - entity.boundingBox.width / 2,
          y: nextCenter.y - entity.boundingBox.height / 2,
          width: entity.boundingBox.width,
          height: entity.boundingBox.height
        };
      }

      changesets.push(this.scene.updateEntity(id, patch));
    }

    const merged = mergeChangesets(changesets);
    if (merged.updated.length === 0) return;

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

  private addEntity(entity: EntityModel): void {
    const baseline = !this.historyReplaying && !this.gesture.active ? this.scene.save() : null;
    const changeset = this.scene.addEntity(entity);

    this.recordSceneMutation();
    if (changeset.added.length > 0) {
      this.emit({ type: "GRAPHICS.SCENE_CHANGED", changes: changeset });
    }
    this.recomputeDrawCommands();

    if (baseline) {
      this.history.pushExecuted(
        new SnapshotSceneCommand((scene) => this.applySnapshot(scene), baseline, this.scene.save(), "Add Entity"),
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

function cloneEntityTemplate(entity: EntityModel): EntityModel {
  return JSON.parse(JSON.stringify(entity)) as EntityModel;
}

function idPrefixForEntityType(type: string): string {
  if (type === "TRACK") return "track";
  if (type === "ARC_TRACK") return "arcTrack";
  if (type === "BEZIER_TRACK") return "bezierTrack";
  if (type === "PAD") return "pad";
  if (type === "VIA") return "via";
  if (type === "FOOTPRINT") return "footprint";
  if (type === "TEXT") return "text";
  return "entity";
}

function translateEntityInPlace(entity: any, delta: Point): void {
  const shiftPoint = (p: any) => {
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
    p.x += delta.x;
    p.y += delta.y;
  };

  if (entity.position) shiftPoint(entity.position);
  if (entity.center) shiftPoint(entity.center);
  if (entity.p0) shiftPoint(entity.p0);
  if (entity.p1) shiftPoint(entity.p1);
  if (entity.p2) shiftPoint(entity.p2);
  if (entity.p3) shiftPoint(entity.p3);

  if (Array.isArray(entity.points)) {
    for (const p of entity.points) shiftPoint(p);
  }

  if (entity.boundingBox && typeof entity.boundingBox.x === "number" && typeof entity.boundingBox.y === "number") {
    entity.boundingBox.x += delta.x;
    entity.boundingBox.y += delta.y;
  }

  if (entity.transform && typeof entity.transform.e === "number" && typeof entity.transform.f === "number") {
    entity.transform.e += delta.x;
    entity.transform.f += delta.y;
  }
}

function trackBounds(points: Point[], width: number): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const pad = Math.max(0, width / 2);
  return { x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 };
}

function arcBounds(
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  width: number
): Rect {
  const r = Math.max(0, radius);
  const pad = 0;
  const points: Point[] = [];
  const pushPoint = (angle: number) => {
    points.push({ x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
  };
  pushPoint(startAngle);
  pushPoint(endAngle);
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (const a of angles) {
    if (isAngleInArc(a, startAngle, endAngle, clockwise)) pushPoint(a);
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
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

function isAngleInArc(angle: number, startAngle: number, endAngle: number, clockwise: boolean): boolean {
  const ccw = clockwise;
  const delta = angleDeltaSigned(startAngle, endAngle, ccw);
  const diff = angleDeltaSigned(startAngle, angle, ccw);
  const eps = 1e-12;
  if (!Number.isFinite(delta) || Math.abs(delta) <= eps) return false;
  if (delta > 0) return diff >= -eps && diff <= delta + eps;
  return diff <= eps && diff >= delta - eps;
}

function isAngleBetweenCCW(angle: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return angle >= start && angle <= end;
  return angle >= start || angle <= end;
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

function bezierBounds(points: Point[], width: number): Rect {
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];
  if (!p0 || !p1 || !p2 || !p3) return { x: 0, y: 0, width: 0, height: 0 };

  const ts = new Set<number>();
  ts.add(0);
  ts.add(1);
  for (const t of cubicBezierExtremaTs(p0.x, p1.x, p2.x, p3.x)) ts.add(t);
  for (const t of cubicBezierExtremaTs(p0.y, p1.y, p2.y, p3.y)) ts.add(t);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const t of ts) {
    const p = cubicBezierPoint(p0, p1, p2, p3, t);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function cubicBezierExtremaTs(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 3 * p0 - 6 * p1 + 3 * p2;
  const c = -3 * p0 + 3 * p1;

  const A = 3 * a;
  const B = 2 * b;
  const C = c;
  const eps = 1e-12;
  const out: number[] = [];

  if (Math.abs(A) < eps) {
    if (Math.abs(B) < eps) return out;
    const t = -C / B;
    if (t > 0 && t < 1) out.push(t);
    return out;
  }

  const disc = B * B - 4 * A * C;
  if (disc < 0) return out;
  const s = Math.sqrt(disc);
  const t1 = (-B + s) / (2 * A);
  const t2 = (-B - s) / (2 * A);
  if (t1 > 0 && t1 < 1) out.push(t1);
  if (t2 > 0 && t2 < 1) out.push(t2);
  return out;
}
