import type { Point } from "../math/types.js";
import type { DrawCommand } from "../view/drawCommands.js";
import type { InputKeyEvent, InputPointerEvent, Tool, ToolContext, ToolEventResult } from "./Tool.js";
import { handledStop, unhandled } from "./Tool.js";

export class WallDrawingTool implements Tool {
  readonly type = "wallDrawing" as const;

  private points: Point[] = [];
  private previewPoint: Point | null = null;

  onEnter(): void {
    this.points = [];
    this.previewPoint = null;
  }

  onExit(): void {
    this.points = [];
    this.previewPoint = null;
  }

  onPointerEvent(event: InputPointerEvent, ctx: ToolContext): ToolEventResult {
    if (event.type === "pointermove") {
      if (this.points.length === 0) return unhandled();
      const snapped = ctx.snapPoint(event.worldPosition, {
        enableGrid: true,
        enableEndpoints: true,
        enableWalls: true,
        thresholdPx: 10
      });
      this.previewPoint = snapped.point;
      ctx.setEphemeralDrawCommands(this.previewCommands());
      return handledStop();
    }

    if (event.type === "pointerdown" && (event.buttons & 1) === 1) {
      const snapped = ctx.snapPoint(event.worldPosition, {
        enableGrid: true,
        enableEndpoints: true,
        enableWalls: true,
        thresholdPx: 10
      });
      const p = snapped.point;
      const last = this.points[this.points.length - 1] ?? null;
      if (!last || last.x !== p.x || last.y !== p.y) {
        this.points.push(p);
        this.previewPoint = p;
      }
      ctx.setEphemeralDrawCommands(this.previewCommands());
      return handledStop();
    }

    if (event.type === "doubleclick") {
      this.commit(ctx);
      return handledStop();
    }

    return unhandled();
  }

  onKeyDown(event: InputKeyEvent, ctx: ToolContext): ToolEventResult {
    if (event.key === "Escape") {
      this.commit(ctx);
      return handledStop();
    }
    return unhandled();
  }

  private commit(ctx: ToolContext): void {
    const pts = [...this.points];
    if (this.previewPoint) {
      const last = pts[pts.length - 1];
      if (!last || last.x !== this.previewPoint.x || last.y !== this.previewPoint.y) {
        pts.push(this.previewPoint);
      }
    }
    if (pts.length >= 2) {
      ctx.addWallPolyline(pts);
    }
    this.points = [];
    this.previewPoint = null;
    ctx.setEphemeralDrawCommands([]);
  }

  private previewCommands(): DrawCommand[] {
    const pts = [...this.points];
    if (this.previewPoint) {
      const last = pts[pts.length - 1];
      if (!last || last.x !== this.previewPoint.x || last.y !== this.previewPoint.y) {
        pts.push(this.previewPoint);
      }
    }
    if (pts.length < 2) return [];
    return [
      {
        id: "preview_wall_polyline",
        kind: "polyline",
        zIndex: 90,
        state: "normal",
        style: { strokeColor: "#999", lineWidth: 10, lineDash: [40, 20], opacity: 0.9 },
        points: pts
      }
    ];
  }
}
