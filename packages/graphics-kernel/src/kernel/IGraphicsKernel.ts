import type { Point, Rect, Transform2D } from "../math/types.js";
import type { SceneModel } from "../model/models.js";
import type { SceneChangeSet } from "../scene/SceneManager.js";
import type { DrawCommand } from "../view/drawCommands.js";
import type { InputKeyEvent, InputPointerEvent, ToolType } from "../tools/Tool.js";

export type GraphicsKernelEvent =
  | { type: "GRAPHICS.SCENE_CHANGED"; changes: SceneChangeSet }
  | { type: "GRAPHICS.SELECTION_CHANGED"; selectedIds: string[] }
  | { type: "GRAPHICS.DRAW_COMMANDS_CHANGED"; commands: DrawCommand[]; viewTransform: Transform2D }
  | { type: "VIEWPORT.PAN_CHANGED"; offsetX: number; offsetY: number; scale: number }
  | { type: "VIEWPORT.ZOOM_CHANGED"; scale: number };

export type GraphicsKernelEventHandler = (event: GraphicsKernelEvent) => void;

export type SetToolParams =
  | { type: "selection" };

export type SelectionTransformHandleType = "move" | "rotate" | "scale-nw" | "scale-ne" | "scale-se" | "scale-sw";

export type SelectionTransform =
  | { type: "translate"; delta: Point }
  | { type: "scale"; scaleX: number; scaleY: number; pivot?: Point }
  | { type: "rotate"; angleRad: number; pivot?: Point };

export interface IGraphicsKernel {
  on(handler: GraphicsKernelEventHandler): () => void;

  reset(): void;
  load(scene: SceneModel): void;
  save(): SceneModel;

  setWorldToScreenTransform(transform: Transform2D): void;
  setViewportSize(size: { width: number; height: number }): void;

  panViewport(deltaX: number, deltaY: number): void;
  zoomViewportAt(screenPoint: { x: number; y: number }, deltaY: number): void;
  resetViewport(): void;

  setTool(params: SetToolParams): void;
  getActiveTool(): ToolType;

  handlePointerEvent(event: InputPointerEvent): void;
  handleKeyDown(event: InputKeyEvent): void;
  handleKeyUp(event: InputKeyEvent): void;

  beginSelectionTransform(pointerId: number): void;
  updateSelectionTransform(transform: SelectionTransform): void;
  endSelectionTransform(pointerId?: number): void;

  setObjectProperties(id: string, patch: Record<string, unknown>): void;

  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  getDrawCommands(): DrawCommand[];
  getSelection(): string[];
  getSelectionBounds(): Rect | null;
}

export type { InputKeyEvent, InputPointerEvent, ToolType, InputPointerEventType } from "../tools/Tool.js";
