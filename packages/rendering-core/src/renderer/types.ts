import type { DrawCommand } from "../scene/drawCommands.js";
import type { Rect, Transform2D } from "../math/types.js";

export type RendererError = {
  message: string;
  commandId?: string;
  commandIndex?: number;
  cause?: unknown;
};

export type RendererDiagnostics = {
  lastFrameMs: number;
  lastCommandCount: number;
  lastDrawCalls: number;
  lastStateChanges: number;
  lastRenderedAt: number;
};

export type RendererOptions = {
  backgroundColor?: string;
  devicePixelRatio?: number;
  useDirtyRects?: boolean;
  onError?: (error: RendererError) => void;
};

export type SceneDrawData = {
  commands: DrawCommand[];
  dirtyRects?: Rect[];
  fullRedraw?: boolean;
  viewTransform?: Transform2D;
};
