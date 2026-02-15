import { BaseTool } from "./BaseTool.js";
import type { InputKeyEvent, InputPointerEvent, ToolContext } from "../../tools/Tool.js";
import { BezierTrackModel, TrackModel } from "../../model/pcb.js";
import { createId } from "../../scene/id.js";
import type { Point } from "../../math/types.js";

export class DrawBezierTool extends BaseTool {
  readonly type = "bezier";

  private points: Point[] = [];
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

    this.points.push(p);
    this.currentMouse = p;

    if (this.points.length === 4) {
      const [p0, p1, p2, p3] = this.points;
      const entity = new BezierTrackModel(
        createId("bezierTrack"),
        "layer-1",
        0.5,
        p0!,
        p1!,
        p2!,
        p3!
      );
      entity.metadata["color"] = this.color;
      context.addEntity(entity);
      this.pendingIds.push(entity.id);

      this.points = [p3!];
      this.currentMouse = p3!;
    }

    this.updateGhost(context);
  }

  override onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    if (this.points.length === 0) return;
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
    if (this.points.length === 0 || !this.currentMouse) {
      context.setGhostEntity(null);
      return;
    }

    if (this.points.length === 1) {
      const ghost = new TrackModel("ghost_bezier_line", "layer-1", 0.25, [this.points[0]!, this.currentMouse]);
      ghost.metadata["color"] = this.color;
      context.setGhostEntity(ghost);
      return;
    }

    if (this.points.length === 2) {
      const ghost = new TrackModel("ghost_bezier_poly", "layer-1", 0.25, [this.points[0]!, this.points[1]!, this.currentMouse]);
      ghost.metadata["color"] = this.color;
      context.setGhostEntity(ghost);
      return;
    }

    const p0 = this.points[0]!;
    const p1 = this.points[1]!;
    const p2 = this.points[2]!;
    const p3 = this.currentMouse;
    const ghost = new BezierTrackModel("ghost_bezier", "layer-1", 0.25, p0, p1, p2, p3);
    ghost.metadata["color"] = this.color;
    context.setGhostEntity(ghost);
  }

  private finish(context: ToolContext): void {
    this.pendingIds = [];
    this.reset();
    context.setGhostEntity(null);
  }

  private reset(): void {
    this.points = [];
    this.currentMouse = null;
    this.pendingIds = [];
  }
}
