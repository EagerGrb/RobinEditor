import type { Point, Rect } from "../math/types.js";
import type { GridModel, SceneModel, EntityModel } from "../model/models.js";
import type { DrawCommand, DrawCommandState, DrawStyle, PolylineCommand } from "./drawCommands.js";

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
    // Placeholder for now. EDA entities will have their own rendering logic.
    // For now, we render the bounding box as a fallback.
    const rect = entity.boundingBox;
    const p0: Point = { x: rect.x, y: rect.y };
    const p1: Point = { x: rect.x + rect.width, y: rect.y };
    const p2: Point = { x: rect.x + rect.width, y: rect.y + rect.height };
    const p3: Point = { x: rect.x, y: rect.y + rect.height };
    
    const style = this.styleForState(state, {
      strokeColor: "#999",
      lineWidth: 2
    });

    return [{
      id: entity.id,
      kind: "polyline",
      zIndex: 10,
      state,
      style,
      points: [p0, p1, p2, p3, p0]
    }];
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
      return { ...base, strokeColor: "#ff7f0e" };
    }
    if (state === "hover") {
      return { ...base, strokeColor: "#ffbb78" };
    }
    return base;
  }
}
