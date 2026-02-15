import type { InputKeyEvent, InputPointerEvent, ToolContext, ToolType } from "../../tools/Tool.js";
import { DrawToolFactory } from "./DrawToolFactory.js";
import type { ITool } from "./ITool.js";

export class ToolManager {
  private currentTool: ITool;
  private factory: DrawToolFactory;
  private currentToolType: ToolType;

  constructor() {
    this.factory = new DrawToolFactory();
    // Default to selection tool
    this.currentToolType = "selection";
    this.currentTool = this.factory.createTool(this.currentToolType);
  }

  get activeTool(): ITool {
    return this.currentTool;
  }

  get activeToolType(): ToolType {
    return this.currentToolType;
  }

  setTool(toolType: ToolType, context: ToolContext): void {
    this.currentTool.onExit(context);
    this.currentToolType = toolType;
    this.currentTool = this.factory.createTool(toolType);
    this.currentTool.onEnter(context);
  }

  onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    this.currentTool.onPointerDown(event, context);
  }

  onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    this.currentTool.onPointerMove(event, context);
  }

  onPointerUp(event: InputPointerEvent, context: ToolContext): void {
    this.currentTool.onPointerUp(event, context);
  }

  onKeyDown(event: InputKeyEvent, context: ToolContext): void {
    this.currentTool.onKeyDown(event, context);
  }
}
