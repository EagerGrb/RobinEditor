import type { ToolType } from "../../tools/Tool.js";
import type { ITool } from "./ITool.js";
import { SelectTool } from "./SelectTool.js";
import { DrawTrackTool } from "./DrawTrackTool.js";
import { DrawArcTool } from "./DrawArcTool.js";
import { DrawBezierTool } from "./DrawBezierTool.js";
import { DrawPadTool } from "./DrawPadTool.js";
import { DrawViaTool } from "./DrawViaTool.js";
import { BaseTool } from "./BaseTool.js";

class NoOpTool extends BaseTool {
  readonly type = "generic";
}

export class DrawToolFactory {
  createTool(type: ToolType): ITool {
    switch (type) {
      case "selection":
        return new SelectTool();
      case "track":
        return new DrawTrackTool();
      case "arc":
        return new DrawArcTool();
      case "bezier":
        return new DrawBezierTool();
      case "pad":
        return new DrawPadTool();
      case "via":
        return new DrawViaTool();
      default:
        return new NoOpTool();
    }
  }
}
