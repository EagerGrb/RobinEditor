import type { Tool, ToolType, InputPointerEvent, ToolEventResult, ToolContext } from "./Tool.js";

export class SelectionTool implements Tool {
  readonly type: ToolType = "selection";

  onPointerEvent(event: InputPointerEvent, ctx: ToolContext): ToolEventResult {
    if (event.type === "pointerdown") {
      const hit = ctx.hitTest(event.worldPosition, 5);
      if (hit) {
        ctx.setSelection([hit], "replace");
        return { handled: true, propagate: false };
      } else {
        ctx.setSelection([], "replace");
      }
    }
    return { handled: false, propagate: true };
  }
}
