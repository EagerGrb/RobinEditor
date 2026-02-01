export type DrawCommandBase = {
  id: string;
  zIndex?: number;
  state?: "normal" | "hover" | "selected";
};

export type DrawLineCommand = DrawCommandBase & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor?: string;
  lineWidth?: number;
  lineDash?: number[];
  opacity?: number;
};

export type DrawTextCommand = DrawCommandBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
  font?: string;
  fillColor?: string;
  opacity?: number;
  textAlign?: CanvasTextAlign;
};

export type DrawCommand = DrawLineCommand | DrawTextCommand;

export type RendererStats = {
  lastFrameMs: number;
  drawCalls: number;
  primitives: number;
};

export type IRenderer2D = {
  init(canvas: HTMLCanvasElement, options?: unknown): void;
  updateScene(commands: DrawCommand[] | unknown): void;
  render(): void;
  resize(width: number, height: number): void;
  getStats?(): RendererStats;
};

