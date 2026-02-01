import type { Point, Rect } from "../math/types.js";
import type { DimensionModel, GridModel, OpeningModel, WallModel } from "../model/models.js";
import { lerpPoint, segmentLength } from "../geometry/segment.js";
import type { DrawCommand, DrawCommandState, DrawStyle, LineCommand, PolylineCommand, TextCommand } from "./drawCommands.js";

export type ViewGeneratorInput = {
  grid: GridModel;
  walls: WallModel[];
  openings: OpeningModel[];
  dimensions: DimensionModel[];
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
    const { grid, walls, openings, dimensions, selection, viewportWorldRect, ephemeral } = input;

    if (grid.visible && viewportWorldRect) {
      commands.push(...this.generateGridCommands(grid, viewportWorldRect));
    }

    for (const wall of walls) {
      commands.push(this.wallToCommand(wall, this.stateFor(wall.id, selection)));
    }

    for (const opening of openings) {
      const wall = walls.find((w) => w.id === opening.wallId);
      if (!wall) continue;
      commands.push(...this.openingToCommands(opening, wall, this.stateFor(opening.id, selection)));
    }

    for (const dim of dimensions) {
      commands.push(...this.dimensionToCommands(dim, this.stateFor(dim.id, selection)));
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

  private wallToCommand(wall: WallModel, state: DrawCommandState): LineCommand {
    const style = this.styleForState(state, {
      strokeColor: "#666",
      lineWidth: wall.thickness
    });
    return {
      id: wall.id,
      kind: "line",
      zIndex: 10,
      state,
      style,
      a: wall.start,
      b: wall.end
    };
  }

  private openingToCommands(opening: OpeningModel, wall: WallModel, state: DrawCommandState): DrawCommand[] {
    const anchor = lerpPoint(wall.start, wall.end, opening.position);
    const len = segmentLength(wall.start, wall.end);
    if (len <= 0) return [];
    const dir = { x: (wall.end.x - wall.start.x) / len, y: (wall.end.y - wall.start.y) / len };
    const half = opening.width / 2;
    const a: Point = { x: anchor.x - dir.x * half, y: anchor.y - dir.y * half };
    const b: Point = { x: anchor.x + dir.x * half, y: anchor.y + dir.y * half };

    const style = this.styleForState(state, {
      strokeColor: opening.openingKind === "door" ? "#1f77b4" : "#2ca02c",
      lineWidth: Math.max(20, wall.thickness * 0.6)
    });

    return [
      {
        id: opening.id,
        kind: "line",
        zIndex: 12,
        state,
        style,
        a,
        b
      }
    ];
  }

  private dimensionToCommands(dimension: DimensionModel, state: DrawCommandState): DrawCommand[] {
    const points = dimension.points;
    if (points.length < 2) return [];
    const style = this.styleForState(state, {
      strokeColor: "#d62728",
      lineWidth: 10,
      lineDash: [40, 20]
    });
    const poly: PolylineCommand = {
      id: dimension.id,
      kind: "polyline",
      zIndex: 20,
      state,
      style,
      points
    };

    const total = this.pathLength(points);
    const mid = points[Math.floor(points.length / 2)]!;
    const text: TextCommand = {
      id: `${dimension.id}_text`,
      kind: "text",
      zIndex: 21,
      state,
      style: {
        fillColor: "#d62728",
        font: "240px sans-serif",
        textAlign: "center",
        textBaseline: "middle"
      },
      position: { x: mid.x, y: mid.y - dimension.offset },
      text: total.toFixed(dimension.precision),
      rotation: 0
    };

    return [poly, text];
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
      style: { strokeColor: "#3399ff", lineWidth: 10, lineDash: [30, 20], opacity: 0.8 },
      points: [p0, p1, p2, p3, p0]
    };
  }

  private generateGridCommands(grid: GridModel, viewportWorldRect: Rect): DrawCommand[] {
    const spacing = grid.spacing;
    if (spacing <= 0) return [];

    const minX = viewportWorldRect.x;
    const minY = viewportWorldRect.y;
    const maxX = viewportWorldRect.x + viewportWorldRect.width;
    const maxY = viewportWorldRect.y + viewportWorldRect.height;

    const startX = Math.floor(minX / spacing) * spacing;
    const endX = Math.ceil(maxX / spacing) * spacing;
    const startY = Math.floor(minY / spacing) * spacing;
    const endY = Math.ceil(maxY / spacing) * spacing;

    const style = { strokeColor: "#eee", lineWidth: 5 };
    const commands: DrawCommand[] = [];

    for (let x = startX; x <= endX; x += spacing) {
      commands.push({
        id: `grid_x_${x}`,
        kind: "line",
        zIndex: 0,
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
        zIndex: 0,
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
      return { ...base, strokeColor: "#ff7f0e" };
    }
    if (state === "hover") {
      return { ...base, strokeColor: "#9467bd" };
    }
    return base;
  }

  private pathLength(points: Point[]): number {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }
}
