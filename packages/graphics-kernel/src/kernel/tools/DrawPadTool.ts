import { BaseTool } from "./BaseTool.js";
import { ToolContext, InputPointerEvent } from "../../tools/Tool.js";
import { PadModel } from "../../model/pcb.js";
import { createId } from "../../scene/id.js";

export class DrawPadTool extends BaseTool {
  readonly type = "pad";

  override onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    const p = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 }).point;
    const ghost = new PadModel(
      "ghost_pad",
      "circle",
      p,
      { w: 2, h: 2 },
      0,
      ["layer-1"],
      "through",
      undefined,
      "1"
    );
    context.setGhostEntity(ghost);
  }

  override onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    if (event.buttons & 1) {
      const p = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 }).point;
      const pad = new PadModel(
        createId("pad"),
        "circle",
        p,
        { w: 2, h: 2 },
        0,
        ["layer-1"],
        "through",
        undefined,
        "1"
      );
      context.addEntity(pad);
    }
  }

  override onPointerUp(event: InputPointerEvent, context: ToolContext): void {
    // No-op
  }
  
  override onExit(context: ToolContext): void {
    context.setGhostEntity(null);
  }
}
