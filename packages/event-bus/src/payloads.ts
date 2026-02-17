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

export type DialogType = "ALERT" | "CONFIRM" | "PROMPT" | "CUSTOM";

export type DialogRequestPayload = {
  id: string;
  type: DialogType;
  title: string;
  content?: string;
  component?: string;
  props?: Record<string, unknown>;
  onConfirm?: (data: unknown) => void;
  onCancel?: () => void;
};

export type GraphicsSelectionPayload =
  | { type: "none" }
  | { type: string; id: string; metadata?: Record<string, unknown> };

export type GraphicsEntityUpdatedPayload = {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
};

export type RectPayload = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphicsSelectionSetPayload = {
  selectedIds: string[];
  bounds: RectPayload | null;
  entityCount: number;
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
  modifiers: NormalizedModifiers;
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

type TopicsConst = typeof import("./topics.js").Topics;

export type TopicPayloadMap = {
  [K in TopicsConst["UI_COMMAND"]]: UICommandPayload;
} & {
  [K in TopicsConst["UI_TOOL_CHANGED"]]: UIToolChangedPayload;
} & {
  [K in TopicsConst["UI_OBJECT_PROPERTIES_CHANGED"]]: UIObjectPropertiesChangedPayload;
} & {
  [K in TopicsConst["DIALOG_REQUEST"]]: DialogRequestPayload;
} & {
  [K in TopicsConst["VIEWPORT_PAN_CHANGED"]]: ViewportPanChangedPayload;
} & {
  [K in TopicsConst["VIEWPORT_ZOOM_CHANGED"]]: ViewportZoomChangedPayload;
} & {
  [K in TopicsConst["GRAPHICS_SELECTION_CHANGED"]]: GraphicsSelectionPayload;
} & {
  [K in TopicsConst["GRAPHICS_SELECTION_SET_CHANGED"]]: GraphicsSelectionSetPayload;
} & {
  [K in TopicsConst["GRAPHICS_ENTITY_UPDATED"]]: GraphicsEntityUpdatedPayload;
} & {
  [K in TopicsConst["GRAPHICS_RENDER_UPDATED"]]: GraphicsRenderUpdatedPayload;
} & {
  [K in TopicsConst["INPUT_BOX_SELECTION_START"]]: InputBoxSelectionStartPayload;
} & {
  [K in TopicsConst["INPUT_BOX_SELECTION_CHANGE"]]: InputBoxSelectionChangePayload;
} & {
  [K in TopicsConst["INPUT_BOX_SELECTION_END"]]: InputBoxSelectionEndPayload;
} & {
  [K in TopicsConst["INPUT_VIEWPORT_PAN_START"]]: InputViewportPanStartPayload;
} & {
  [K in TopicsConst["INPUT_VIEWPORT_PAN_MOVE"]]: InputViewportPanMovePayload;
} & {
  [K in TopicsConst["INPUT_VIEWPORT_PAN_END"]]: InputViewportPanEndPayload;
} & {
  [K in TopicsConst["INPUT_VIEWPORT_ZOOM"]]: InputViewportZoomPayload;
} & {
  [K in TopicsConst["INPUT_TRANSFORM_HANDLE_START"]]: InputTransformHandleStartPayload;
} & {
  [K in TopicsConst["INPUT_TRANSFORM_HANDLE_DRAG"]]: InputTransformHandleDragPayload;
} & {
  [K in TopicsConst["INPUT_TRANSFORM_HANDLE_END"]]: InputTransformHandleEndPayload;
} & {
  [K in TopicsConst["INPUT_MOUSE_DOWN"]]: InputMouseDownPayload;
} & {
  [K in TopicsConst["INPUT_MOUSE_MOVE"]]: InputMouseMovePayload;
} & {
  [K in TopicsConst["INPUT_MOUSE_UP"]]: InputMouseUpPayload;
} & {
  [K in TopicsConst["INPUT_DOUBLE_CLICK"]]: InputDoubleClickPayload;
} & {
  [K in TopicsConst["INPUT_WHEEL"]]: InputWheelPayload;
} & {
  [K in TopicsConst["INPUT_CONTEXT_MENU"]]: InputContextMenuPayload;
} & {
  [K in TopicsConst["INPUT_KEY_DOWN"]]: InputKeyDownPayload;
} & {
  [K in TopicsConst["INPUT_KEY_UP"]]: InputKeyUpPayload;
} & {
  [K in TopicsConst["INPUT_CANVAS_READY"]]: void;
} & {
  [K in TopicsConst["INPUT_CANVAS_RESIZED"]]: InputCanvasResizedPayload;
} & {
  [K in TopicsConst["LOG_EVENT"]]: { topic: string; payload: unknown };
} & {
  [K in TopicsConst["RENDER_STATS"]]: unknown;
};

export type KnownTopic = keyof TopicPayloadMap;

export type LogEventPayload = {
  topic: string;
  payload: unknown;
};
