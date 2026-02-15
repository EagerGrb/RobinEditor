import { rectFromPoints } from "../../math/rect.js";
import type { Point } from "../../math/types.js";
import type { InputKeyEvent, InputPointerEvent, ToolContext } from "../../tools/Tool.js";
import { BaseTool } from "./BaseTool.js";

export class SelectTool extends BaseTool {
  private draggingMarquee = false;
  private marqueeStartWorld: Point | null = null;
  private marqueeEndWorld: Point | null = null;
  private pendingMarqueeStart: { world: Point; screen: Point } | null = null;
  private readonly marqueeStartThresholdPx = 4;

  private draggingMove = false;
  private lastMovePoint: Point | null = null;

  override onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    if ((event.buttons & 1) !== 1) return;

    context.setMarqueeRect(null);
    const hitId = context.hitTest(event.worldPosition, 8);
    const selection = context.getSelectionState();

    if (hitId) {
      // Logic for selecting the item if not already selected
      const alreadySelected = selection.selectedIds.has(hitId);
      
      if (event.modifiers.shift || event.modifiers.ctrl || event.modifiers.meta) {
        // Toggle selection
        if (alreadySelected) {
           // If we click on an already selected item with modifier, we might want to deselect it?
           // Standard behavior: Toggle.
           // BUT if we want to drag multiple items, clicking one shouldn't deselect it immediately if we start dragging.
           // Complex logic usually: MouseDown -> Check. MouseUp -> Toggle if no drag.
           // For now, let's keep it simple.
           context.setSelection([hitId], "toggle");
        } else {
           context.setSelection([hitId], "add");
        }
      } else {
        if (!alreadySelected) {
           context.setSelection([hitId], "replace");
        }
        // If already selected, do nothing on down (wait for drag), unless we want to clear others?
        // Standard: Click on one of many selected -> keep selection to allow drag.
        // Click on unselected -> replace selection.
      }

      // Initialize Drag
      this.draggingMove = true;
      this.lastMovePoint = event.worldPosition;
      
      this.draggingMarquee = false;
      this.marqueeStartWorld = null;
      this.marqueeEndWorld = null;
      this.pendingMarqueeStart = null;
    } else {
      // Click on empty space
      if (!event.modifiers.shift && !event.modifiers.ctrl && !event.modifiers.meta) {
        context.setSelection([], "replace");
      }
      
      this.draggingMarquee = false;
      this.marqueeStartWorld = null;
      this.marqueeEndWorld = null;
      this.pendingMarqueeStart = { world: event.worldPosition, screen: event.screenPosition };
      
      this.draggingMove = false;
      this.lastMovePoint = null;
    }
  }

  override onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    // 1. Handle Marquee Dragging
    if (this.draggingMarquee && this.marqueeStartWorld) {
      this.marqueeEndWorld = event.worldPosition;
      context.setMarqueeRect(rectFromPoints(this.marqueeStartWorld, this.marqueeEndWorld));
      return;
    }

    // 2. Handle Pending Marquee Start (Threshold check)
    if (this.pendingMarqueeStart) {
      const dx = event.screenPosition.x - this.pendingMarqueeStart.screen.x;
      const dy = event.screenPosition.y - this.pendingMarqueeStart.screen.y;
      if (Math.hypot(dx, dy) >= this.marqueeStartThresholdPx) {
        this.draggingMarquee = true;
        this.marqueeStartWorld = this.pendingMarqueeStart.world;
        this.marqueeEndWorld = event.worldPosition;
        this.pendingMarqueeStart = null;
        context.setMarqueeRect(rectFromPoints(this.marqueeStartWorld, event.worldPosition));
      }
      return;
    }

    // 3. Handle Entity Dragging (Move)
    if (this.draggingMove && this.lastMovePoint) {
      const current = event.worldPosition;
      const delta = {
        x: current.x - this.lastMovePoint.x,
        y: current.y - this.lastMovePoint.y
      };
      
      // Update last point first to avoid accumulating errors or double moves if we called this frequently
      this.lastMovePoint = current;
      
      // Perform translation
      context.translateSelected(delta);
      return;
    }

    // 4. Hover effect (only if not dragging)
    const hoverId = context.hitTest(event.worldPosition, 8);
    context.setHover(hoverId);
  }

  override onPointerUp(event: InputPointerEvent, context: ToolContext): void {
    if (this.draggingMarquee) {
      const start = this.marqueeStartWorld;
      const end = this.marqueeEndWorld;
      if (start && end) {
        const rect = rectFromPoints(start, end);
        const hitMode = end.x >= start.x ? "contain" : "intersect";
        const ids = context.hitTestRect(rect, hitMode);
        const selectionMode = event.modifiers.shift
          ? "add"
          : event.modifiers.ctrl || event.modifiers.meta
            ? "toggle"
            : "replace";
        context.setSelection(ids, selectionMode);
      }
    }
    this.draggingMarquee = false;
    this.marqueeStartWorld = null;
    this.marqueeEndWorld = null;
    this.pendingMarqueeStart = null;
    this.draggingMove = false;
    this.lastMovePoint = null;
    context.setMarqueeRect(null);
  }

  override onKeyDown(event: InputKeyEvent, context: ToolContext): void {
    if (event.key === "Delete" || event.key === "Backspace") {
      context.deleteSelection();
    }
    if (event.key === "r" || event.key === "R") {
      context.rotateSelected(90);
    }
    if (event.key === "Escape") {
      context.setSelection([], "replace");
      this.draggingMove = false;
      this.draggingMarquee = false;
      this.pendingMarqueeStart = null;
      context.setMarqueeRect(null);
    }
  }
}
