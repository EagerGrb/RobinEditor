import { rectFromPoints } from "../math/rect.js";
import type { Point } from "../math/types.js";
import type { InputKeyEvent, InputPointerEvent, Tool, ToolContext, ToolEventResult } from "./Tool.js";
import { handledStop, unhandled } from "./Tool.js";

export class SelectionTool implements Tool {
  readonly type = "selection" as const;

  private draggingMarquee = false;
  private marqueeStartWorld: Point | null = null;
  private marqueeEndWorld: Point | null = null;
  private pendingMarqueeStart: { world: Point; screen: Point } | null = null;
  private marqueeStartThresholdPx = 4;

  private draggingMove = false;
  private lastMovePoint: Point | null = null;

  onPointerEvent(event: InputPointerEvent, ctx: ToolContext): ToolEventResult {
    if (event.type === "pointermove") {
      if (this.draggingMarquee && this.marqueeStartWorld) {
        this.marqueeEndWorld = event.worldPosition;
        if (this.marqueeStartWorld) {
          ctx.setMarqueeRect(rectFromPoints(this.marqueeStartWorld, event.worldPosition));
        }
        return handledStop();
      }

      if (this.pendingMarqueeStart) {
        const dx = event.screenPosition.x - this.pendingMarqueeStart.screen.x;
        const dy = event.screenPosition.y - this.pendingMarqueeStart.screen.y;
        if (Math.hypot(dx, dy) >= this.marqueeStartThresholdPx) {
          this.draggingMarquee = true;
          this.marqueeStartWorld = this.pendingMarqueeStart.world;
          this.marqueeEndWorld = event.worldPosition;
          this.pendingMarqueeStart = null;
          ctx.setMarqueeRect(rectFromPoints(this.marqueeStartWorld, event.worldPosition));
        }
        return handledStop();
      }

      if (this.draggingMove && this.lastMovePoint) {
        const delta = {
          x: event.worldPosition.x - this.lastMovePoint.x,
          y: event.worldPosition.y - this.lastMovePoint.y
        };
        this.lastMovePoint = event.worldPosition;
        ctx.translateSelected(delta);
        return handledStop();
      }

      const hoverId = ctx.hitTest(event.worldPosition, 8);
      ctx.setHover(hoverId);
      return unhandled();
    }

    if (event.type === "pointerdown" && (event.buttons & 1) === 1) {
      ctx.setMarqueeRect(null);
      const hitId = ctx.hitTest(event.worldPosition, 8);
      const selection = ctx.getSelectionState();

      if (hitId) {
        const alreadySelected = selection.selectedIds.has(hitId);
        if (event.modifiers.shift || event.modifiers.ctrl || event.modifiers.meta) {
          ctx.setSelection([hitId], "toggle");
        } else {
          if (!alreadySelected) ctx.setSelection([hitId], "replace");
        }

        this.draggingMove = true;
        this.lastMovePoint = event.worldPosition;
        this.draggingMarquee = false;
        this.marqueeStartWorld = null;
        this.marqueeEndWorld = null;
        this.pendingMarqueeStart = null;
        return handledStop();
      }

      if (!event.modifiers.shift) {
        ctx.setSelection([], "replace");
      }
      this.draggingMarquee = false;
      this.marqueeStartWorld = null;
      this.marqueeEndWorld = null;
      this.pendingMarqueeStart = { world: event.worldPosition, screen: event.screenPosition };
      this.draggingMove = false;
      this.lastMovePoint = null;
      return handledStop();
    }

    if (event.type === "pointerup") {
      if (this.draggingMarquee) {
        const start = this.marqueeStartWorld;
        const end = this.marqueeEndWorld;
        if (start && end) {
          const rect = rectFromPoints(start, end);
          const ids = ctx.hitTestRect(rect);
          const mode = event.modifiers.shift ? "add" : event.modifiers.ctrl || event.modifiers.meta ? "toggle" : "replace";
          ctx.setSelection(ids, mode);
        }
      }
      this.draggingMarquee = false;
      this.marqueeStartWorld = null;
      this.marqueeEndWorld = null;
      this.pendingMarqueeStart = null;
      this.draggingMove = false;
      this.lastMovePoint = null;
      ctx.setMarqueeRect(null);
      return handledStop();
    }

    return unhandled();
  }

  onKeyDown(event: InputKeyEvent, ctx: ToolContext): ToolEventResult {
    if (event.key === "Delete" || event.key === "Backspace") {
      ctx.deleteSelection();
      return handledStop();
    }
    return unhandled();
  }
}
