import { BaseTool } from "./BaseTool.js";
import { ToolContext, InputPointerEvent } from "../../tools/Tool.js";
import { ViaModel } from "../../model/pcb.js";
import { createId } from "../../scene/id.js";

export class DrawViaTool extends BaseTool {
  readonly type = "via";

  override onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    const p = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 }).point;
    const ghost = new ViaModel(
      "ghost_via",
      p,
      0.6, // drill
      1.2, // diameter
      ["layer-1", "layer-2"]
    );
    context.setGhostEntity(ghost);
  }

  override onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    if (event.buttons & 1) {
      const p = context.snapPoint(event.worldPosition, { enableGrid: true, thresholdPx: 10 }).point;
      const via = new ViaModel(
        createId("via"),
        p,
        0.6,
        1.2,
        ["layer-1", "layer-2"]
      );
      context.addEntity(via);
    }
  }

  override onPointerUp(event: InputPointerEvent, context: ToolContext): void {
    // No-op
  }
  
  override onExit(context: ToolContext): void {
    context.setGhostEntity(null);
  }
}
