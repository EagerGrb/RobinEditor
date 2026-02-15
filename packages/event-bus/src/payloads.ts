export type UIToolType = "select" | "wall" | "opening" | "dimension";

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
  | { type: "wall"; id: string }
  | { type: "opening"; id: string }
  | { type: "dimension"; id: string };

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
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type ViewportPanChangedPayload = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type ViewportZoomChangedPayload = {
  scale: number;
};

export type InputMouseDownPayload = {
  x: number;
  y: number;
  buttons: number;
  button: number;
  pointerId: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputMouseMovePayload = {
  x: number;
  y: number;
  buttons: number;
  pointerId: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputMouseUpPayload = {
  x: number;
  y: number;
  buttons: number;
  button: number;
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

export type InputWheelPayload = {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputContextMenuPayload = {
  x: number;
  y: number;
  buttons: number;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type InputKeyPayload = {
  key: string;
  code: string;
  modifiers: NormalizedModifiers;
  timestamp: number;
};

export type CanvasReadyPayload = {
  canvas: HTMLCanvasElement;
};

export type CanvasResizedPayload = {
  width: number;
  height: number;
  dpr: number;
};

export type LogEventPayload = {
  topic: string;
  payload: unknown;
};

export type TopicPayloadMap = {
  "UI.COMMAND": UICommandPayload;
  "UI.TOOL_CHANGED": UIToolChangedPayload;
  "UI.OBJECT_PROPERTIES_CHANGED": UIObjectPropertiesChangedPayload;

  "VIEWPORT.PAN_CHANGED": ViewportPanChangedPayload;
  "VIEWPORT.ZOOM_CHANGED": ViewportZoomChangedPayload;

  "GRAPHICS.SELECTION_CHANGED": GraphicsSelectionPayload;
  "GRAPHICS.RENDER_UPDATED": unknown;

  "INPUT.BOX_SELECTION_START": InputBoxSelectionStartPayload;
  "INPUT.BOX_SELECTION_CHANGE": InputBoxSelectionChangePayload;
  "INPUT.BOX_SELECTION_END": InputBoxSelectionEndPayload;

  "INPUT.VIEWPORT_PAN_START": InputViewportPanStartPayload;
  "INPUT.VIEWPORT_PAN_MOVE": InputViewportPanMovePayload;
  "INPUT.VIEWPORT_PAN_END": InputViewportPanEndPayload;
  "INPUT.VIEWPORT_ZOOM": InputViewportZoomPayload;

  "INPUT.MOUSE_DOWN": InputMouseDownPayload;
  "INPUT.MOUSE_MOVE": InputMouseMovePayload;
  "INPUT.MOUSE_UP": InputMouseUpPayload;
  "INPUT.DOUBLE_CLICK": InputDoubleClickPayload;
  "INPUT.WHEEL": InputWheelPayload;
  "INPUT.CONTEXT_MENU": InputContextMenuPayload;
  "INPUT.KEY_DOWN": InputKeyPayload;
  "INPUT.KEY_UP": InputKeyPayload;
  "INPUT.CANVAS_READY": CanvasReadyPayload;
  "INPUT.CANVAS_RESIZED": CanvasResizedPayload;

  "LOG.EVENT": LogEventPayload;
  "RENDER.STATS": unknown;
};

export type KnownTopic = keyof TopicPayloadMap;
