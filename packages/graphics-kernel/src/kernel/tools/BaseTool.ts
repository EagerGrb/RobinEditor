import type { InputKeyEvent, InputPointerEvent, ToolContext } from "../../tools/Tool";
import type { ITool } from "./ITool";

export abstract class BaseTool implements ITool {
  onEnter(context: ToolContext): void {
    // No-op
  }

  onExit(context: ToolContext): void {
    // No-op
  }

  onPointerDown(event: InputPointerEvent, context: ToolContext): void {
    // No-op
  }

  onPointerMove(event: InputPointerEvent, context: ToolContext): void {
    // No-op
  }

  onPointerUp(event: InputPointerEvent, context: ToolContext): void {
    // No-op
  }

  onKeyDown(event: InputKeyEvent, context: ToolContext): void {
    // No-op
  }
}
