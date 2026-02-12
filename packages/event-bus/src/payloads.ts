export type UIToolType = string;

export type UICommandPayload = {
  command: string;
  params?: Record<string, unknown>;
};

export type UIToolChangedPayload = {
  tool: UIToolType;
};

export type UIObjectPropertiesChangedPayload = {
  id: string;
  patch: Record<string, unknown>;
};

export type GraphicsSelectionPayload =
  | { type: "none" }
  | { type: string; id: string };

export type RectPayload = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphicsSelectionSetPayload = {
  selectedIds: string[];
  bounds: RectPayload | null;
};

export type TransformHandleType = "move" | "rotate" | "scale-nw" | "scale-ne" | "scale-se" | "scale-sw";

export type InputTransformHandleStartPayload = {
  handleType: TransformHandleType;
  x: number;
  y: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputTransformHandleDragPayload = {
  handleType: TransformHandleType;
  x: number;
  y: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputTransformHandleEndPayload = {
  handleType: TransformHandleType;
  timestamp: number;
};

export type NormalizedModifiers = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export type InputBoxSelectionStartPayload = {
  x: number;
  y: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputBoxSelectionChangePayload = {
  x: number;
  y: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputBoxSelectionEndPayload = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputViewportPanStartPayload = {
  x: number;
  y: number;
  timestamp: number;
};

export type InputViewportPanMovePayload = {
  deltaX: number;
  deltaY: number;
  timestamp: number;
};

export type InputViewportPanEndPayload = {
  timestamp: number;
};

export type InputViewportZoomPayload = {
  x: number;
  y: number;
  deltaY: number;
  timestamp: number;
};

export type InputClickPayload = {
  x: number;
  y: number;
  buttons: number;
  pointerId: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputDoubleClickPayload = {
  x: number;
  y: number;
  buttons: number;
  pointerId: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputKeyDownPayload = {
  key: string;
  code: string;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputKeyUpPayload = {
  key: string;
  code: string;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputCanvasResizedPayload = {
  width: number;
  height: number;
  dpr: number;
};

export type ViewportZoomChangedPayload = {
  scale: number;
};

export type ViewportPanChangedPayload = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type GraphicsRenderUpdatedPayload = {
  commands: unknown[]; // Type cycle avoidance, actual type is DrawCommand[]
  dirtyRects: RectPayload[];
  viewTransform: { a: number; b: number; c: number; d: number; e: number; f: number };
};
