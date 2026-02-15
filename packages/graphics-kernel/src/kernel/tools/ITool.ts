import type { InputKeyEvent, InputPointerEvent, ToolContext } from "../../tools/Tool";

export interface ITool {
  onEnter(context: ToolContext): void;
  onExit(context: ToolContext): void;
  onPointerDown(event: InputPointerEvent, context: ToolContext): void;
  onPointerMove(event: InputPointerEvent, context: ToolContext): void;
  onPointerUp(event: InputPointerEvent, context: ToolContext): void;
  onKeyDown(event: InputKeyEvent, context: ToolContext): void;
}
