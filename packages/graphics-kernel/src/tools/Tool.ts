import type { Point, Rect } from "../math/types.js";
import type { DrawCommand } from "../view/drawCommands.js";

export type InputModifiers = {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  space: boolean;
};

export type InputPointerEventType =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "doubleclick"
  | "wheel";

export type InputPointerEvent = {
  type: InputPointerEventType;
  pointerId: number;
  buttons: number;
  worldPosition: Point;
  screenPosition: Point;
  deltaX?: number;
  deltaY?: number;
  modifiers: InputModifiers;
  timestamp: number;
};

export type InputKeyEvent = {
  key: string;
  modifiers: InputModifiers;
  timestamp: number;
};

export type ToolEventResult = {
  handled: boolean;
  propagate: boolean;
};

export function unhandled(): ToolEventResult {
  return { handled: false, propagate: true };
}

export function handledStop(): ToolEventResult {
  return { handled: true, propagate: false };
}

export type ToolType = "selection" | "generic";

export type SelectionState = {
  selectedIds: ReadonlySet<string>;
  hoverId: string | null;
  marqueeRect: Rect | null;
};

export type SnapOptions = {
  enableGrid: boolean;
  thresholdPx: number;
};

export type SnapResult = {
  point: Point;
  candidate: { kind: "grid"; point: Point; distance: number } | null;
};

export type ToolContext = {
  getSelectionState(): SelectionState;
  setHover(id: string | null): void;
  setSelection(ids: string[], mode: "replace" | "toggle" | "add"): void;
  setMarqueeRect(rect: Rect | null): void;

  snapPoint(p: Point, options: SnapOptions): SnapResult;

  hitTest(p: Point, thresholdPx: number): string | null;
  hitTestRect(rect: Rect): string[];

  translateSelected(delta: Point): void;
  deleteSelection(): void;

  setEphemeralDrawCommands(commands: DrawCommand[]): void;
};

export interface Tool {
  readonly type: ToolType;

  onEnter?(previousTool: ToolType | null): void;
  onExit?(nextTool: ToolType | null): void;

  onPointerEvent?(event: InputPointerEvent, ctx: ToolContext): ToolEventResult;
  onKeyDown?(event: InputKeyEvent, ctx: ToolContext): ToolEventResult;
  onKeyUp?(event: InputKeyEvent, ctx: ToolContext): ToolEventResult;
}
