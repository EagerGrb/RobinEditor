
import type { Point, Rect, Transform2D } from "../math/types.js";
import type { GridModel, SceneModel, EntityModel } from "../model/models.js";
import { applyTransformToPoint } from "../math/transform.js";
import type { 
  DrawCommand, 
  DrawCommandState, 
  DrawStyle, 
  PolylineCommand, 
  PathCommand, 
  PathSegment, 
  CircleCommand,
  LineCommand,
  PolygonCommand
} from "./drawCommands.js";

import {
  BoardModel,
  BoardOutlineModel,
  FootprintModel,
  PadModel,
  TrackModel,
  ViaModel,
  LayerStackModel,
  LayerModel,
  PcbDocumentModel,
  PadShape
} from "../model/pcb.js";

import { PCB_COLORS, LINE_WIDTHS } from "./constants.js";
import { PadView } from "./shapes/PadView.js";
import { ViaView } from "./shapes/ViaView.js";
import { TrackView } from "./shapes/TrackView.js";
import { Primitive, Arc, Bezier, Line, Polygon, Polyline } from "../model/primitive.js";

export type ViewGeneratorInput = {
  grid: GridModel;
  scene?: SceneModel;
  board?: BoardModel;
  selection: {
    selectedIds: ReadonlySet<string>;
    hoverId: string | null;
    marqueeRect: Rect | null;
  };
  viewportWorldRect: Rect | null;
  ephemeral: DrawCommand[];
  ghostEntity?: EntityModel | null;
};

export class ViewGenerator {
  private padView = new PadView();
  private viaView = new ViaView();
  private trackView = new TrackView();

  generate(input: ViewGeneratorInput): DrawCommand[] {
    const commands: DrawCommand[] = [];
    const { grid, scene, board, selection, viewportWorldRect, ephemeral, ghostEntity } = input;

    if (grid.visible && viewportWorldRect) {
      commands.push(...this.generateGridCommands(grid, viewportWorldRect));
    }

    let layerStack: LayerStackModel | undefined;
    let zMap: Map<string, number> | undefined;

    if (board) {
      layerStack = board.layerStack;
      zMap = this.buildLayerZMap(layerStack);
    }

    if (scene) {
      for (const entity of scene.entities) {
        commands.push(...this.entityToCommands(entity, this.stateFor(entity.id, selection), layerStack, zMap));
      }
    }

    if (board) {
      commands.push(...this.boardToCommands(board, selection));
    }

    if (selection.marqueeRect) commands.push(this.marqueeToCommand(selection.marqueeRect));

    if (ghostEntity) {
      commands.push(...this.entityToCommands(ghostEntity, "normal", layerStack, zMap));
    }

    commands.push(...ephemeral);

    commands.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    return commands;
  }

  private stateFor(id: string, selection: ViewGeneratorInput["selection"]): DrawCommandState {
    if (selection.selectedIds.has(id)) return "selected";
    if (selection.hoverId === id) return "hover";
    return "normal";
  }

  private entityToCommands(entity: EntityModel, state: DrawCommandState, layerStack?: LayerStackModel, zMap?: Map<string, number>): DrawCommand[] {
    if (entity.type === 'TRACK') {
      const primitives = this.trackView.render(entity as TrackModel, { state, layerStack, zMap });
      return primitives.flatMap(p => this.primitiveToCommands(p));
    }
    if (entity.type === 'ARC_TRACK') {
      const e: any = entity as any;
      const zIndex = zMap?.get(e.layerId) ?? 5000;
      let color = '#ff4d4f';
      if (e.metadata && typeof e.metadata['color'] === 'string') {
        color = e.metadata['color'] === "#00e5ff" ? "#ff4d4f" : e.metadata['color'];
      } else if (layerStack) {
        color = this.getLayerColor(e.layerId, layerStack);
      }
      const drawStyle = this.styleForState(state, { strokeColor: color, lineWidth: e.width, opacity: 1 });
      const style: any = {
        stroke: drawStyle.strokeColor,
        strokeWidth: Math.max(drawStyle.lineWidth ?? 1, 1),
        opacity: drawStyle.opacity,
        lineCap: 'round',
        lineJoin: 'round'
      };
      const arc = new Arc(entity.id, e.center, e.radius, e.startAngle, e.endAngle, !!e.clockwise);
      arc.style = style;
      (arc as any).zIndex = zIndex;
      (arc as any).state = state;
      return this.primitiveToCommands(arc);
    }
    if (entity.type === 'BEZIER_TRACK') {
      const e: any = entity as any;
      const zIndex = zMap?.get(e.layerId) ?? 5000;
      let color = '#ff4d4f';
      if (e.metadata && typeof e.metadata['color'] === 'string') color = e.metadata['color'];
      else if (layerStack) color = this.getLayerColor(e.layerId, layerStack);
      const drawStyle = this.styleForState(state, { strokeColor: color, lineWidth: e.width, opacity: 1 });
      const style: any = {
        stroke: drawStyle.strokeColor,
        strokeWidth: Math.max(drawStyle.lineWidth ?? 1, 1),
        opacity: drawStyle.opacity,
        lineCap: 'round',
        lineJoin: 'round'
      };
      const bez = new Bezier(entity.id, e.p0, e.p1, e.p2, e.p3);
      bez.style = style;
      (bez as any).zIndex = zIndex;
      (bez as any).state = state;
      return this.primitiveToCommands(bez);
    }
    if (entity.type === 'PAD') {
      const primitives = this.padView.render(entity as PadModel, { state, layerStack, zMap });
      return primitives.flatMap(p => this.primitiveToCommands(p));
    }
    if (entity.type === 'VIA') {
      const primitives = this.viaView.render(entity as ViaModel, { state, layerStack, zMap });
      return primitives.flatMap(p => this.primitiveToCommands(p));
    }

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

  private boardToCommands(board: BoardModel, selection: ViewGeneratorInput["selection"]): DrawCommand[] {
    const commands: DrawCommand[] = [];
    const layerZMap = this.buildLayerZMap(board.layerStack);

    if (board.outline) {
      commands.push(...this.boardOutlineToCommands(board.outline, this.stateFor(board.outline.id, selection)));
    }

    for (const track of board.tracks.values()) {
      const primitives = this.trackView.render(track, { state: this.stateFor(track.id, selection), layerStack: board.layerStack, zMap: layerZMap });
      commands.push(...primitives.flatMap(p => this.primitiveToCommands(p)));
    }

    for (const via of board.vias.values()) {
      const primitives = this.viaView.render(via, { state: this.stateFor(via.id, selection), layerStack: board.layerStack, zMap: layerZMap });
      commands.push(...primitives.flatMap(p => this.primitiveToCommands(p)));
    }

    for (const pad of board.pads.values()) {
       const primitives = this.padView.render(pad, { state: this.stateFor(pad.id, selection), layerStack: board.layerStack, zMap: layerZMap });
       commands.push(...primitives.flatMap(p => this.primitiveToCommands(p)));
    }
    
    for (const footprint of board.footprints.values()) {
        if (selection.selectedIds.has(footprint.id) || selection.hoverId === footprint.id) {
           // Maybe render bounding box or similar
        }
    }

    return commands;
  }

  private buildLayerZMap(layerStack: LayerStackModel): Map<string, number> {
    const map = new Map<string, number>();
    for (const layer of layerStack.layers) {
      let baseZ = 5000;
      if (layer.layerType === 'mechanical') baseZ = 3000;
      else if (layer.name.toLowerCase().includes('bottom')) baseZ = 4000;
      else if (layer.name.toLowerCase().includes('top')) baseZ = 6000;
      
      map.set(layer.id, baseZ + layer.order * 10);
    }
    return map;
  }

  private getLayerColor(layerId: string, layerStack: LayerStackModel): string {
    const layer = layerStack.layers.find(l => l.id === layerId);
    if (!layer) return '#999';
    if (layer.color) return layer.color;
    
    if (layer.name.toLowerCase().includes('top')) {
      if (layer.layerType === 'silk') return PCB_COLORS.LAYERS.TOP_SILK;
      return PCB_COLORS.LAYERS.TOP_LAYER;
    }
    if (layer.name.toLowerCase().includes('bottom')) {
      if (layer.layerType === 'silk') return PCB_COLORS.LAYERS.BOTTOM_SILK;
      return PCB_COLORS.LAYERS.BOTTOM_LAYER;
    }
    if (layer.layerType === 'mechanical') return PCB_COLORS.LAYERS.MECH;
    return '#CCCCCC';
  }

  private boardOutlineToCommands(outline: BoardOutlineModel, state: DrawCommandState): DrawCommand[] {
    const points = outline.shape.exterior.points;
    const pts = points.map(p => applyTransformToPoint(outline.transform, p));

    if (pts.length === 0) return [];

    return [{
      id: outline.id,
      kind: "polyline",
      zIndex: 3500,
      state,
      style: this.styleForState(state, {
        strokeColor: PCB_COLORS.LAYERS.BOARD_OUTLINE,
        lineWidth: LINE_WIDTHS.OUTLINE
      }),
      points: [...pts, pts[0]!]
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
      zIndex: 10000,
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
        zIndex: 2000,
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
        zIndex: 2000,
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
      return { ...base, strokeColor: PCB_COLORS.SELECTION };
    }
    if (state === "hover") {
      return { ...base, strokeColor: PCB_COLORS.HOVER };
    }
    return base;
  }

  private primitiveToCommands(primitive: Primitive): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const zIndex = (primitive as any).zIndex ?? 0;
    const state = (primitive as any).state ?? "normal";
    
    const fill = (primitive.style as any)?.fill;
    const style: any = {
      fillColor: typeof fill === "string" && fill.length > 0 && fill !== "none" ? fill : undefined,
      strokeColor: primitive.style?.stroke,
      lineWidth: primitive.style?.strokeWidth,
      opacity: primitive.style?.opacity,
    };

    // Copy extended style properties if available
    if ((primitive.style as any)?.lineCap) style.lineCap = (primitive.style as any).lineCap;
    if ((primitive.style as any)?.lineJoin) style.lineJoin = (primitive.style as any).lineJoin;
    if ((primitive.style as any)?.lineDash) style.lineDash = (primitive.style as any).lineDash;

    if (primitive instanceof Arc) {
      if (Math.abs(primitive.endAngle - primitive.startAngle) >= Math.PI * 2 - 0.001) {
         cmds.push({
           id: primitive.id,
           kind: "circle",
           zIndex,
           state,
           style,
           center: primitive.center,
           radius: primitive.radius
         });
      } else {
         cmds.push({
           id: primitive.id,
           kind: "arc",
           zIndex,
           state,
           style,
           center: primitive.center,
           radius: primitive.radius,
           startAngle: primitive.startAngle,
           endAngle: primitive.endAngle,
           anticlockwise: !primitive.clockwise
         });
      }
    } else if (primitive instanceof Bezier) {
      cmds.push({
        id: primitive.id,
        kind: "bezier",
        zIndex,
        state,
        style,
        p0: primitive.p0,
        p1: primitive.p1,
        p2: primitive.p2,
        p3: primitive.p3
      });
    } else if (primitive instanceof Polygon) {
       const segs = primitive.exterior.segments;
       
       // Check if all segments are Lines
       const allLines = segs.every(s => s instanceof Line);

       if (allLines && segs.length > 0) {
          const pts: Point[] = [];
          if (segs[0] instanceof Line) {
             pts.push((segs[0] as Line).start);
             for (const s of segs) {
                if (s instanceof Line) pts.push(s.end);
             }
          }
          cmds.push({
            id: primitive.id,
            kind: "polygon",
            zIndex,
            state,
            style,
            points: pts
          });
       } else {
          // Mixed segments (Lines + Arcs), use Path
          const segments: PathSegment[] = [];
          for (const seg of segs) {
              if (seg instanceof Line) {
                  segments.push({ kind: "line", a: seg.start, b: seg.end });
              } else if (seg instanceof Arc) {
                  segments.push({ 
                    kind: "arc", 
                    center: seg.center, 
                    radius: seg.radius, 
                    startAngle: seg.startAngle, 
                    endAngle: seg.endAngle, 
                    anticlockwise: !seg.clockwise 
                  });
              } else if (seg instanceof Bezier) {
                  segments.push({
                    kind: "bezier",
                    p0: seg.p0,
                    p1: seg.p1,
                    p2: seg.p2,
                    p3: seg.p3
                  });
              }
          }
          cmds.push({
            id: primitive.id,
            kind: "path",
            zIndex,
            state,
            style,
            segments,
            closed: true
          });
       }
    } else if (primitive instanceof Polyline) {
       // Check if it's a simple line strip (Track)
       const allLines = primitive.segments.every(s => s instanceof Line);
       // Check connectivity? Assuming connected for simplicity or checking first/last
       // For Tracks, we know they are connected lines.
       
       if (allLines && primitive.segments.length > 0) {
          // Convert to polyline command (points) for better lineJoin support
          const pts: Point[] = [];
          const first = primitive.segments[0] as Line;
          pts.push(first.start);
          for (const s of primitive.segments) {
             if (s instanceof Line) pts.push(s.end);
          }
          
          cmds.push({
             id: primitive.id,
             kind: "polyline",
             zIndex,
             state,
             style,
             points: pts
          });
       } else {
           const segments: PathSegment[] = [];
           for (const seg of primitive.segments) {
              if (seg instanceof Line) {
                 segments.push({ kind: "line", a: seg.start, b: seg.end });
              } else if (seg instanceof Arc) {
                 segments.push({ 
                   kind: "arc", 
                   center: seg.center, 
                   radius: seg.radius, 
                   startAngle: seg.startAngle, 
                   endAngle: seg.endAngle,
                   anticlockwise: !seg.clockwise
                 });
              } else if (seg instanceof Bezier) {
                 segments.push({
                   kind: "bezier",
                   p0: seg.p0,
                   p1: seg.p1,
                   p2: seg.p2,
                   p3: seg.p3
                 });
              }
           }
           cmds.push({
             id: primitive.id,
             kind: "path",
             zIndex,
             state,
             style,
             segments,
             closed: !!style.fillColor // Close if filled
           });
       }
    }

    return cmds;
  }
}
