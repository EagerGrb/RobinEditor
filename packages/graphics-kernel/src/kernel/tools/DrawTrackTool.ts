import { BaseTool } from "./BaseTool.js";
import { ToolContext, InputPointerEvent, InputKeyEvent, handledStop, unhandled } from "../../tools/Tool.js";
import { TrackModel } from "../../model/pcb.js";
import { createId } from "../../scene/id.js";
import { Point } from "../../math/types.js";

export class DrawTrackTool extends BaseTool {
  readonly type = "track";
  
  private points: Point[] = [];
  private currentMousePos: Point | null = null;
  // Store the IDs of tracks we added during this session so we can remove them if cancelled
  private pendingTrackIds: string[] = [];

  override onEnter(context: ToolContext): void {
    context.setSelection([], "replace");
    this.reset();
  }

  override onExit(context: ToolContext): void {
    context.setGhostEntity(null);
    this.reset();
  }

  override onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    // Right click to finish
    if (event.buttons & 2) {
      this.finish(context);
      return;
    }

    // Left click to add point
    if (event.buttons & 1) {
      const snapResult = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 });
      const p = snapResult.point;

      if (this.points.length === 0) {
        // First point
        this.points.push(p);
        this.currentMousePos = p;
        this.updateGhost(context);
      } else {
        const lastPoint = this.points[this.points.length - 1];
        if (!lastPoint) return;
        // Avoid zero length
        if (lastPoint.x !== p.x || lastPoint.y !== p.y) {
          // Add new point to chain
          this.points.push(p);
          
          // Create the segment immediately
          const segment = new TrackModel(
            createId("track"),
            "layer-1",
            0.5,
            [lastPoint, p]
          );
          
          // Important: We need to ensure we don't accidentally select it or clear selection
          // which might trigger scene refreshes that mess up our tool state?
          // No, but we just need to add it.
          context.addEntity(segment);
          this.pendingTrackIds.push(segment.id);
          
          // Advance current position for ghost
          this.currentMousePos = p;
          this.updateGhost(context);
        }
      }
    }
  }

  override onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    if (this.points.length > 0) {
       const snapResult = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 });
       this.currentMousePos = snapResult.point;
       this.updateGhost(context);
    }
  }

  override onKeyDown(event: InputKeyEvent, context: ToolContext): void {
    if (event.key === "Escape") {
      this.finish(context);
    }
  }

  private finish(context: ToolContext) {
    // Commit: Just clear our tracking list, leaving the entities in the scene
    this.pendingTrackIds = [];
    this.reset();
    context.setGhostEntity(null);
  }

  private cancel(context: ToolContext) {
    // Rollback: Delete all tracks added during this session
    if (this.pendingTrackIds.length > 0) {
      context.setSelection(this.pendingTrackIds, "replace");
      context.deleteSelection();
      context.setSelection([], "replace");
    }
    this.reset();
    context.setGhostEntity(null);
  }

  private updateGhost(context: ToolContext): void {
    if (this.points.length === 0 || !this.currentMousePos) return;
    const lastPoint = this.points[this.points.length - 1];
    if (!lastPoint) return;
    
    // Ghost is just the active segment being dragged
    const ghost = new TrackModel(
      "ghost_track",
      "layer-1",
      0.5,
      [lastPoint, this.currentMousePos]
    );
    context.setGhostEntity(ghost);
  }

  private reset() {
    this.points = [];
    this.currentMousePos = null;
    this.pendingTrackIds = [];
  }
}
