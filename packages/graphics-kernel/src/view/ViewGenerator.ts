import type { Point, Rect } from "../math/types.js";
import { applyTransformToPoint } from "../math/transform.js";
import type { GridModel, SceneModel, EntityModel } from "../model/models.js";
import type { DrawCommand, DrawCommandState, DrawStyle, PolylineCommand } from "./drawCommands.js";
import { PCB_COLORS } from "./constants.js";
import { ArcTrackModel, BezierTrackModel, PadModel, TrackModel, ViaModel } from "../model/pcb.js";

export type ViewGeneratorInput = {
  grid: GridModel;
  scene: SceneModel;
  selection: {
    selectedIds: ReadonlySet<string>;
    hoverId: string | null;
    marqueeRect: Rect | null;
  };
  viewportWorldRect: Rect | null;
  ephemeral: DrawCommand[];
};

export class ViewGenerator {
  generate(input: ViewGeneratorInput): DrawCommand[] {
    const commands: DrawCommand[] = [];
    const { grid, scene, selection, viewportWorldRect, ephemeral } = input;

    if (grid.visible && viewportWorldRect) {
      commands.push(...this.generateGridCommands(grid, viewportWorldRect));
    }

    for (const entity of scene.entities) {
      commands.push(...this.entityToCommands(entity, this.stateFor(entity.id, selection)));
    }

    if (selection.marqueeRect) commands.push(this.marqueeToCommand(selection.marqueeRect));

    commands.push(...ephemeral);

    commands.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    return commands;
  }

  private stateFor(id: string, selection: ViewGeneratorInput["selection"]): DrawCommandState {
    if (selection.selectedIds.has(id)) return "selected";
    if (selection.hoverId === id) return "hover";
    return "normal";
  }

  private entityToCommands(entity: EntityModel, state: DrawCommandState): DrawCommand[] {
    const isGhost = entity.id.startsWith("ghost") || entity.metadata?.["ghost"] === true;

    if (entity.type === "TRACK") {
      const track = entity as unknown as TrackModel;
      const pts = Array.isArray(track.points) ? track.points : [];
      if (pts.length < 2) return [];

      const color = typeof track.metadata?.["color"] === "string" ? (track.metadata["color"] as string) : "#CCCCCC";
      const style = this.styleForState(state, {
        strokeColor: isGhost ? PCB_COLORS.GHOST : color,
        lineWidth: Math.max(0.1, track.width ?? 0.5),
        lineCap: "round",
        lineJoin: "round",
        opacity: isGhost ? 0.7 : 1,
        lineDash: isGhost ? [6, 4] : undefined
      });

      return [
        {
          id: track.id,
          kind: "polyline",
          zIndex: isGhost ? 90000 : 5000,
          state,
          style,
          points: pts.map((p) => ({ x: p.x, y: p.y }))
        }
      ];
    }

    if (entity.type === "ARC_TRACK") {
      const arc = entity as unknown as ArcTrackModel;
      const color = typeof arc.metadata?.["color"] === "string" ? (arc.metadata["color"] as string) : "#CCCCCC";
      const style = this.styleForState(state, {
        strokeColor: isGhost ? PCB_COLORS.GHOST : color,
        lineWidth: Math.max(0.1, arc.width ?? 0.5),
        lineCap: "round",
        lineJoin: "round",
        opacity: isGhost ? 0.7 : 1,
        lineDash: isGhost ? [6, 4] : undefined
      });

      return [
        {
          id: arc.id,
          kind: "arc",
          zIndex: isGhost ? 90000 : 5000,
          state,
          style,
          center: { x: arc.center.x, y: arc.center.y },
          radius: arc.radius,
          startAngle: arc.startAngle,
          endAngle: arc.endAngle,
          anticlockwise: !arc.clockwise
        }
      ];
    }

    if (entity.type === "BEZIER_TRACK") {
      const b = entity as unknown as BezierTrackModel;
      const color = typeof b.metadata?.["color"] === "string" ? (b.metadata["color"] as string) : "#CCCCCC";
      const style = this.styleForState(state, {
        strokeColor: isGhost ? PCB_COLORS.GHOST : color,
        lineWidth: Math.max(0.1, b.width ?? 0.5),
        lineCap: "round",
        lineJoin: "round",
        opacity: isGhost ? 0.7 : 1,
        lineDash: isGhost ? [6, 4] : undefined
      });

      return [
        {
          id: b.id,
          kind: "bezier",
          zIndex: isGhost ? 90000 : 5000,
          state,
          style,
          p0: { x: b.p0.x, y: b.p0.y },
          p1: { x: b.p1.x, y: b.p1.y },
          p2: { x: b.p2.x, y: b.p2.y },
          p3: { x: b.p3.x, y: b.p3.y }
        }
      ];
    }

    if (entity.type === "PAD") {
      const pad = entity as unknown as PadModel;
      const center = applyTransformToPoint(pad.transform, { x: 0, y: 0 });
      const color = typeof pad.metadata?.["color"] === "string" ? (pad.metadata["color"] as string) : PCB_COLORS.PAD.PLATING_BAR;
      const baseStyle = this.styleForState(state, {
        fillColor: isGhost ? PCB_COLORS.GHOST : color,
        strokeColor: state === "normal" ? "transparent" : PCB_COLORS.SELECTION,
        lineWidth: 0.2,
        opacity: isGhost ? 0.6 : 1
      });

      const out: DrawCommand[] = [];

      if (pad.shape === "circle") {
        out.push({
          id: pad.id,
          kind: "circle",
          zIndex: isGhost ? 90000 : 6500,
          state,
          style: baseStyle,
          center: { x: center.x, y: center.y },
          radius: Math.max(0.1, (pad.size?.w ?? 1) / 2)
        });
      } else {
        const w = pad.size?.w ?? 1;
        const h = pad.size?.h ?? 1;
        const pts = [
          applyTransformToPoint(pad.transform, { x: -w / 2, y: -h / 2 }),
          applyTransformToPoint(pad.transform, { x: w / 2, y: -h / 2 }),
          applyTransformToPoint(pad.transform, { x: w / 2, y: h / 2 }),
          applyTransformToPoint(pad.transform, { x: -w / 2, y: h / 2 })
        ];
        out.push({
          id: pad.id,
          kind: "polygon",
          zIndex: isGhost ? 90000 : 6500,
          state,
          style: baseStyle,
          points: pts
        });
      }

      if (pad.drill && pad.drill.diameter > 0) {
        const holeCenter = applyTransformToPoint(pad.transform, pad.drill.offset ?? { x: 0, y: 0 });
        out.push({
          id: `${pad.id}_drill`,
          kind: "circle",
          zIndex: 6510,
          state: "normal",
          style: { fillColor: PCB_COLORS.PAD.THROUGH_HOLE, strokeColor: "transparent", opacity: 1 },
          center: { x: holeCenter.x, y: holeCenter.y },
          radius: Math.max(0.05, pad.drill.diameter / 2)
        });
      }

      return out;
    }

    if (entity.type === "VIA") {
      const via = entity as unknown as ViaModel;
      const center = applyTransformToPoint(via.transform, { x: 0, y: 0 });
      const ringStyle = this.styleForState(state, {
        fillColor: isGhost ? PCB_COLORS.GHOST : PCB_COLORS.PAD.PLATING_BAR,
        strokeColor: state === "normal" ? "transparent" : PCB_COLORS.SELECTION,
        lineWidth: 0.2,
        opacity: isGhost ? 0.6 : 1
      });

      return [
        {
          id: via.id,
          kind: "circle",
          zIndex: isGhost ? 90000 : 6500,
          state,
          style: ringStyle,
          center: { x: center.x, y: center.y },
          radius: Math.max(0.1, via.diameter / 2)
        },
        {
          id: `${via.id}_drill`,
          kind: "circle",
          zIndex: 6510,
          state: "normal",
          style: { fillColor: PCB_COLORS.PAD.THROUGH_HOLE, strokeColor: "transparent", opacity: 1 },
          center: { x: center.x, y: center.y },
          radius: Math.max(0.05, via.drill / 2)
        }
      ];
    }

    const rect = entity.boundingBox;
    const p0: Point = { x: rect.x, y: rect.y };
    const p1: Point = { x: rect.x + rect.width, y: rect.y };
    const p2: Point = { x: rect.x + rect.width, y: rect.y + rect.height };
    const p3: Point = { x: rect.x, y: rect.y + rect.height };

    const style = this.styleForState(state, { strokeColor: "#999", lineWidth: 2, opacity: 0.8, lineDash: [4, 4] });

    return [
      {
        id: entity.id,
        kind: "polyline",
        zIndex: 10,
        state,
        style,
        points: [p0, p1, p2, p3, p0]
      }
    ];
  }

  private marqueeToCommand(rect: Rect): PolylineCommand {
    const p0: Point = { x: rect.x, y: rect.y };
    const p1: Point = { x: rect.x + rect.width, y: rect.y };
    const p2: Point = { x: rect.x + rect.width, y: rect.y + rect.height };
    const p3: Point = { x: rect.x, y: rect.y + rect.height };
    return {
      id: "marquee",
      kind: "polyline",
      zIndex: 100,
      state: "normal",
      style: { strokeColor: "#3399ff", lineWidth: 1, lineDash: [5, 5], opacity: 0.8 },
      points: [p0, p1, p2, p3, p0]
    };
  }

  private generateGridCommands(grid: GridModel, viewportWorldRect: Rect): DrawCommand[] {
    const spacing = grid.size;
    if (spacing <= 0) return [];

    const minX = viewportWorldRect.x;
    const minY = viewportWorldRect.y;
    const maxX = viewportWorldRect.x + viewportWorldRect.width;
    const maxY = viewportWorldRect.y + viewportWorldRect.height;

    const startX = Math.floor(minX / spacing) * spacing;
    const endX = Math.ceil(maxX / spacing) * spacing;
    const startY = Math.floor(minY / spacing) * spacing;
    const endY = Math.ceil(maxY / spacing) * spacing;

    const style = { strokeColor: "#333", lineWidth: 1, opacity: 0.2 };
    const commands: DrawCommand[] = [];

    for (let x = startX; x <= endX; x += spacing) {
      commands.push({
        id: `grid_x_${x}`,
        kind: "line",
        zIndex: -1,
        state: "normal",
        style,
        a: { x, y: startY },
        b: { x, y: endY }
      });
    }

    for (let y = startY; y <= endY; y += spacing) {
      commands.push({
        id: `grid_y_${y}`,
        kind: "line",
        zIndex: -1,
        state: "normal",
        style,
        a: { x: startX, y },
        b: { x: endX, y }
      });
    }

    return commands;
  }

  private styleForState(state: DrawCommandState, base: DrawStyle): DrawStyle {
    if (state === "selected") {
      return { ...base, strokeColor: PCB_COLORS.SELECTION, lineWidth: Math.max(base.lineWidth ?? 1, 2) };
    }
    if (state === "hover") {
      return { ...base, strokeColor: PCB_COLORS.HOVER, lineWidth: Math.max(base.lineWidth ?? 1, 2) };
    }
    return base;
  }
}
