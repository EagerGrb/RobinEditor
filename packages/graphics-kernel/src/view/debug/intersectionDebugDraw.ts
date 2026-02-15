import type { Point } from "../../math/types.js";
import type { DrawCommand, DrawStyle } from "../drawCommands.js";

export type IxDebugShape =
  | { kind: "point"; p: Point; rWorld?: number; style?: DrawStyle; id?: string; label?: string }
  | { kind: "line"; a: Point; b: Point; style?: DrawStyle; id?: string; label?: string }
  | {
      kind: "arc";
      center: Point;
      radius: number;
      startAngle: number;
      endAngle: number;
      anticlockwise?: boolean;
      style?: DrawStyle;
      id?: string;
      label?: string;
    }
  | { kind: "bezier"; p0: Point; p1: Point; p2: Point; p3: Point; style?: DrawStyle; id?: string; label?: string };

export type IxDebugDrawOptions = {
  idPrefix?: string;
  layer?: number;
  zIndex?: number;
  defaultStyle?: DrawStyle;
  pointRadiusWorld?: number;
  labelStyle?: DrawStyle;
};

export function makeIntersectionDebugCommands(shapes: ReadonlyArray<IxDebugShape>, opt: IxDebugDrawOptions = {}): DrawCommand[] {
  const idPrefix = opt.idPrefix ?? "dbg:ix";
  const layer = opt.layer ?? 100000;
  const zIndex = opt.zIndex ?? 100000;
  const defaultStyle: DrawStyle = opt.defaultStyle ?? { strokeColor: "#00e5ff", lineWidth: 1, opacity: 0.9 };
  const pointRadiusWorld = opt.pointRadiusWorld ?? 2;
  const labelStyle: DrawStyle = opt.labelStyle ?? { fillColor: "#ffffff", font: "12px monospace", opacity: 0.9 };

  const out: DrawCommand[] = [];
  let seq = 0;

  const pushLabel = (p: Point, label: string, id?: string) => {
    out.push({
      kind: "text",
      id: id ?? `${idPrefix}:label:${seq++}`,
      layer,
      zIndex,
      position: { x: p.x + pointRadiusWorld * 1.2, y: p.y - pointRadiusWorld * 1.2 },
      text: label,
      style: labelStyle
    });
  };

  for (const s of shapes) {
    const id = s.id ?? `${idPrefix}:${s.kind}:${seq++}`;
    const style = { ...defaultStyle, ...(s.style ?? {}) };

    if (s.kind === "point") {
      out.push({
        kind: "circle",
        id,
        layer,
        zIndex,
        center: { x: s.p.x, y: s.p.y },
        radius: s.rWorld ?? pointRadiusWorld,
        style: {
          fillColor: style.fillColor ?? "#ffe58f",
          strokeColor: style.strokeColor ?? "#000000",
          lineWidth: style.lineWidth ?? 1,
          opacity: style.opacity
        }
      });
      if (s.label) pushLabel(s.p, s.label, `${id}:label`);
      continue;
    }

    if (s.kind === "line") {
      out.push({
        kind: "line",
        id,
        layer,
        zIndex,
        a: { x: s.a.x, y: s.a.y },
        b: { x: s.b.x, y: s.b.y },
        style
      });
      if (s.label) pushLabel({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, s.label, `${id}:label`);
      continue;
    }

    if (s.kind === "arc") {
      out.push({
        kind: "arc",
        id,
        layer,
        zIndex,
        center: { x: s.center.x, y: s.center.y },
        radius: s.radius,
        startAngle: s.startAngle,
        endAngle: s.endAngle,
        anticlockwise: s.anticlockwise ?? false,
        style
      });
      if (s.label) pushLabel({ x: s.center.x + s.radius, y: s.center.y }, s.label, `${id}:label`);
      continue;
    }

    out.push({
      kind: "bezier",
      id,
      layer,
      zIndex,
      p0: { x: s.p0.x, y: s.p0.y },
      p1: { x: s.p1.x, y: s.p1.y },
      p2: { x: s.p2.x, y: s.p2.y },
      p3: { x: s.p3.x, y: s.p3.y },
      style
    });
    if (s.label) pushLabel(s.p0, s.label, `${id}:label`);
  }

  return out;
}
