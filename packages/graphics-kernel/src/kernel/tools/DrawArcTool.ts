import { BaseTool } from "./BaseTool.js";
import type { InputKeyEvent, InputPointerEvent, ToolContext } from "../../tools/Tool.js";
import { ArcTrackModel, TrackModel } from "../../model/pcb.js";
import { createId } from "../../scene/id.js";
import type { Point } from "../../math/types.js";

export class DrawArcTool extends BaseTool {
  readonly type = "arc";

  private start: Point | null = null;
  private end: Point | null = null;
  private currentMouse: Point | null = null;
  private pendingIds: string[] = [];
  private color = "#ff4d4f";

  override onEnter(context: ToolContext): void {
    context.setSelection([], "replace");
    this.reset();
  }

  override onExit(context: ToolContext): void {
    context.setGhostEntity(null);
    this.reset();
  }

  override onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    if (event.buttons & 2) {
      this.finish(context);
      return;
    }

    if ((event.buttons & 1) === 0) return;
    const snap = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 });
    const p = snap.point;

    if (!this.start) {
      this.start = p;
      this.currentMouse = p;
      this.updateGhost(context);
      return;
    }

    if (!this.end) {
      if (this.start.x === p.x && this.start.y === p.y) return;
      this.end = p;
      this.currentMouse = p;
      this.updateGhost(context);
      return;
    }

    const arc = arcFromThreePoints(this.start, this.end, p);
    if (arc) {
      const entity = new ArcTrackModel(
        createId("arcTrack"),
        "layer-1",
        0.5,
        arc.center,
        arc.radius,
        arc.startAngle,
        arc.endAngle,
        arc.clockwise
      );
      entity.metadata["color"] = this.color;
      context.addEntity(entity);
      this.pendingIds.push(entity.id);
    } else {
      const entity = new TrackModel(createId("track"), "layer-1", 0.5, [this.start, this.end]);
      entity.metadata["color"] = this.color;
      context.addEntity(entity);
      this.pendingIds.push(entity.id);
    }

    this.start = this.end;
    this.end = null;
    this.currentMouse = this.start;
    this.updateGhost(context);
  }

  override onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    if (!this.start) return;
    const snap = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 });
    this.currentMouse = snap.point;
    this.updateGhost(context);
  }

  override onKeyDown(event: InputKeyEvent, context: ToolContext): void {
    if (event.key === "Escape") {
      this.finish(context);
    }
  }

  private updateGhost(context: ToolContext): void {
    if (!this.start || !this.currentMouse) return;

    if (!this.end) {
      const ghost = new TrackModel("ghost_arc_chord", "layer-1", 0.25, [this.start, this.currentMouse]);
      ghost.metadata["color"] = this.color;
      context.setGhostEntity(ghost);
      return;
    }

    const arc = arcFromThreePoints(this.start, this.end, this.currentMouse);
    if (!arc) {
      const ghost = new TrackModel("ghost_arc_line", "layer-1", 0.25, [this.start, this.end]);
      ghost.metadata["color"] = this.color;
      context.setGhostEntity(ghost);
      return;
    }

    const ghost = new ArcTrackModel("ghost_arc", "layer-1", 0.25, arc.center, arc.radius, arc.startAngle, arc.endAngle, arc.clockwise);
    ghost.metadata["color"] = this.color;
    context.setGhostEntity(ghost);
  }

  private finish(context: ToolContext): void {
    this.pendingIds = [];
    this.reset();
    context.setGhostEntity(null);
  }

  private reset(): void {
    this.start = null;
    this.end = null;
    this.currentMouse = null;
    this.pendingIds = [];
  }
}

function arcFromThreePoints(
  p0: Point,
  p1: Point,
  p2: Point
): { center: Point; radius: number; startAngle: number; endAngle: number; clockwise: boolean } | null {
  const d = 2 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y));
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;

  const p0Sq = p0.x * p0.x + p0.y * p0.y;
  const p1Sq = p1.x * p1.x + p1.y * p1.y;
  const p2Sq = p2.x * p2.x + p2.y * p2.y;

  const ux =
    (p0Sq * (p1.y - p2.y) + p1Sq * (p2.y - p0.y) + p2Sq * (p0.y - p1.y)) / d;
  const uy =
    (p0Sq * (p2.x - p1.x) + p1Sq * (p0.x - p2.x) + p2Sq * (p1.x - p0.x)) / d;

  const center = { x: ux, y: uy };
  const radius = Math.hypot(p0.x - ux, p0.y - uy);
  if (!Number.isFinite(radius) || radius <= 1e-9) return null;

  const a0 = Math.atan2(p0.y - uy, p0.x - ux);
  const a1 = Math.atan2(p1.y - uy, p1.x - ux);
  const a2 = Math.atan2(p2.y - uy, p2.x - ux);

  const clockwise = isAngleBetweenCCW(normalizeAngle(a2), normalizeAngle(a0), normalizeAngle(a1));
  return { center, radius, startAngle: a0, endAngle: a1, clockwise };
}

function normalizeAngle(a: number): number {
  const PI2 = Math.PI * 2;
  return ((a % PI2) + PI2) % PI2;
}

function isAngleBetweenCCW(a: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return a >= start && a <= end;
  return a >= start || a <= end;
}
