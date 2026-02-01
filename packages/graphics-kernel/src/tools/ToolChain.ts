import type { InputKeyEvent, InputPointerEvent, Tool, ToolContext, ToolEventResult, ToolType } from "./Tool.js";
import { unhandled } from "./Tool.js";

export class ToolChain {
  private stack: Tool[] = [];

  constructor(baseTool: Tool) {
    this.stack = [baseTool];
  }

  getActiveToolType(): ToolType {
    return this.stack[0]!.type;
  }

  getToolStack(): ToolType[] {
    return this.stack.map((t) => t.type);
  }

  setBaseTool(tool: Tool): void {
    const previous = this.stack[0];
    const nextType = tool.type;
    previous?.onExit?.(nextType);
    this.stack = [tool, ...this.stack.slice(1)];
    tool.onEnter?.(previous?.type ?? null);
  }

  pushOverlay(tool: Tool): void {
    const previousTop = this.stack[this.stack.length - 1];
    previousTop?.onExit?.(tool.type);
    this.stack.push(tool);
    tool.onEnter?.(previousTop?.type ?? null);
  }

  popOverlay(): Tool | null {
    if (this.stack.length <= 1) return null;
    const removed = this.stack.pop()!;
    const nextTop = this.stack[this.stack.length - 1] ?? null;
    removed.onExit?.(nextTop?.type ?? null);
    nextTop?.onEnter?.(removed.type);
    return removed;
  }

  handlePointerEvent(event: InputPointerEvent, ctx: ToolContext): ToolEventResult {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const tool = this.stack[i]!;
      const res = tool.onPointerEvent?.(event, ctx) ?? unhandled();
      if (!res.propagate) return res;
    }
    return unhandled();
  }

  handleKeyDown(event: InputKeyEvent, ctx: ToolContext): ToolEventResult {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const tool = this.stack[i]!;
      const res = tool.onKeyDown?.(event, ctx) ?? unhandled();
      if (!res.propagate) return res;
    }
    return unhandled();
  }

  handleKeyUp(event: InputKeyEvent, ctx: ToolContext): ToolEventResult {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const tool = this.stack[i]!;
      const res = tool.onKeyUp?.(event, ctx) ?? unhandled();
      if (!res.propagate) return res;
    }
    return unhandled();
  }
}
