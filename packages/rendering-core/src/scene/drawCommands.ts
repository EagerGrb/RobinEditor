import type { Point, Rect } from "../math/types.js";

export type DrawCommandState = "normal" | "hover" | "selected";

export type DrawStyle = {
  strokeColor?: string;
  fillColor?: string;
  lineWidth?: number;
  lineDash?: number[];
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  miterLimit?: number;
  opacity?: number;

  font?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
};

export type DrawCommandBase = {
  id?: string;
  layer?: number;
  zIndex?: number;
  state?: DrawCommandState;
  style?: DrawStyle;
  opacity?: number;
  bbox?: Rect;
};

export type LineCommand = DrawCommandBase & {
  kind: "line";
  a: Point;
  b: Point;
};

export type PolylineCommand = DrawCommandBase & {
  kind: "polyline";
  points: Point[];
};

export type PolygonCommand = DrawCommandBase & {
  kind: "polygon";
  points: Point[];
};

export type ArcCommand = DrawCommandBase & {
  kind: "arc";
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  anticlockwise?: boolean;
};

export type CircleCommand = DrawCommandBase & {
  kind: "circle";
  center: Point;
  radius: number;
};

export type TextCommand = DrawCommandBase & {
  kind: "text";
  position: Point;
  text: string;
  maxWidth?: number;
  rotation?: number;
};

export type ImageCommand = DrawCommandBase & {
  kind: "image";
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceRect?: Rect;
};

export type DrawCommand =
  | LineCommand
  | PolylineCommand
  | PolygonCommand
  | ArcCommand
  | CircleCommand
  | TextCommand
  | ImageCommand;

