import type { DrawCommand } from "../scene/drawCommands.js";
import type { RendererDiagnostics, RendererOptions, SceneDrawData } from "./types.js";

export interface IRenderer2D {
  init(canvas: HTMLCanvasElement, options?: RendererOptions): void;
  updateScene(scene: DrawCommand[] | SceneDrawData): void;
  render(): void;
  startLoop(): void;
  stopLoop(): void;
  resize(width: number, height: number): void;
  destroy(): void;
  getDiagnostics(): RendererDiagnostics;
}

