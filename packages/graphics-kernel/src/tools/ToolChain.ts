import type { Tool, InputPointerEvent, InputKeyEvent, ToolContext, ToolType } from "./Tool.js";

export class ToolChain {
  private activeTool: Tool;

  constructor(initialTool: Tool) {
    this.activeTool = initialTool;
  }

  setBaseTool(tool: Tool) {
    if (this.activeTool.onExit) this.activeTool.onExit(tool.type);
    const prev = this.activeTool.type;
    this.activeTool = tool;
    if (this.activeTool.onEnter) this.activeTool.onEnter(prev);
  }

  getActiveToolType(): ToolType {
    return this.activeTool.type;
  }

  handlePointerEvent(event: InputPointerEvent, ctx: ToolContext) {
    if (this.activeTool.onPointerEvent) {
      this.activeTool.onPointerEvent(event, ctx);
    }
  }

  handleKeyDown(event: InputKeyEvent, ctx: ToolContext) {
    if (this.activeTool.onKeyDown) {
      this.activeTool.onKeyDown(event, ctx);
    }
  }

  handleKeyUp(event: InputKeyEvent, ctx: ToolContext) {
    if (this.activeTool.onKeyUp) {
      this.activeTool.onKeyUp(event, ctx);
    }
  }
}
