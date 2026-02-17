import type { Curve2 } from "@render/geometry";
import { evalPoint, intersect } from "@render/geometry";
import type { EntityModel } from "../../model/models.js";
import { ArcTrackModel, BezierTrackModel, TrackModel } from "../../model/pcb.js";
import type { DrawCommand } from "../../view/drawCommands.js";
import { makeIntersectionDebugCommands, type IxDebugShape } from "../../view/debug/intersectionDebugDraw.js";

export class IntersectionRunner {
  static run(entities: ReadonlyArray<EntityModel>): DrawCommand[] {
    const curves: Array<{ id: string; curve: Curve2 }> = [];

    for (const e of entities) {
      const curve = this.toCurve(e);
      if (curve) curves.push({ id: e.id, curve });
    }

    const shapes: IxDebugShape[] = [];
    let ixSeq = 0;

    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const a = curves[i]!;
        const b = curves[j]!;

        const ix = intersect(a.curve, b.curve, { distanceEpsilon: 1e-3 });

        for (const item of ix.items) {
          if (item.kind === "point") {
            const p = evalPoint(a.curve, item.t0);
            shapes.push({
              kind: "point",
              p: { x: p.x, y: p.y },
              rWorld: 3,
              label: `ix${ixSeq++}`,
              style: { fillColor: "#ff4d4f", strokeColor: "#ffffff", lineWidth: 2, opacity: 0.95 }
            });
            continue;
          }

          const p0 = evalPoint(a.curve, item.t0[0]);
          const p1 = evalPoint(a.curve, item.t0[1]);
          shapes.push({
            kind: "line",
            a: { x: p0.x, y: p0.y },
            b: { x: p1.x, y: p1.y },
            label: `ov${ixSeq++}`,
            style: { strokeColor: "#ffa940", lineWidth: 2, opacity: 0.9 }
          });
        }
      }
    }

    return makeIntersectionDebugCommands(shapes, { idPrefix: "dbg:ix", layer: 100000, zIndex: 100000 });
  }

  private static toCurve(e: EntityModel): Curve2 | null {
    if (e.type === "TRACK") {
      const t = e as unknown as TrackModel;
      if (!t.points || t.points.length < 2) return null;
      return {
        kind: "line",
        a: { x: t.points[0]!.x, y: t.points[0]!.y },
        b: { x: t.points[1]!.x, y: t.points[1]!.y }
      };
    }

    if (e.type === "ARC_TRACK") {
      const a = e as unknown as ArcTrackModel;
      if (!a.center || !Number.isFinite(a.radius)) return null;

      const PI2 = Math.PI * 2;
      const normalize = (v: number) => ((v % PI2) + PI2) % PI2;
      const start = normalize(a.startAngle);
      const end = normalize(a.endAngle);
      const sweep = a.clockwise
        ? ((end - start) % PI2 + PI2) % PI2
        : ((start - end) % PI2 + PI2) % PI2;
      const eps = 1e-12;
      const delta = sweep <= eps ? (a.clockwise ? PI2 : -PI2) : (a.clockwise ? sweep : -sweep);

      return {
        kind: "arc",
        c: { x: a.center.x, y: a.center.y },
        r: a.radius,
        start: a.startAngle,
        delta
      };
    }

    if (e.type === "BEZIER_TRACK") {
      const b = e as unknown as BezierTrackModel;
      return {
        kind: "bezier",
        degree: 3,
        cp: [
          { x: b.p0.x, y: b.p0.y },
          { x: b.p1.x, y: b.p1.y },
          { x: b.p2.x, y: b.p2.y },
          { x: b.p3.x, y: b.p3.y }
        ]
      };
    }

    return null;
  }
}
