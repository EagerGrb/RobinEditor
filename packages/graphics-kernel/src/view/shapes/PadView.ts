import { PadModel, LayerStackModel } from '../../model/pcb.js';
import { Primitive, Arc, Line, Polygon, Polyline } from '../../model/primitive.js';
import { PCB_COLORS } from '../constants.js';
import { DrawCommandState, DrawStyle } from '../drawCommands.js';
import { applyTransformToPoint } from '../../math/transform.js';

export class PadView {
  render(
    pad: PadModel, 
    options: {
      state: DrawCommandState, 
      layerStack?: LayerStackModel, 
      zMap?: Map<string, number>
    }
  ): Primitive[] {
    const primitives: Primitive[] = [];
    const { state, layerStack, zMap } = options;
    
    // Determine Z-index and Color
    let zIndex = 0;
    let color = '#CCCCCC';

    if (pad.metadata && typeof pad.metadata['color'] === 'string') {
        color = pad.metadata['color'] as string;
    }

    if (pad.layers.includes('MultiLayer') || pad.padType === 'through') {
       zIndex = 6500; 
       if (color === '#CCCCCC') color = PCB_COLORS.PAD.PLATING_BAR;
    } else if (pad.layers.length > 0) {
       const lid = pad.layers[0]!;
       zIndex = zMap?.get(lid) ?? 5000;
       if (color === '#CCCCCC' && layerStack) {
          color = this.getLayerColor(lid, layerStack);
       }
    }

    const style: DrawStyle = this.styleForState(state, {
      fillColor: color,
      strokeColor: state === 'selected' || state === 'hover' ? '#fff' : "transparent",
      lineWidth: 0.1,
      opacity: 1
    });

    // Generate Shape Primitive
    
    if (pad.shape === 'circle') {
      const center = applyTransformToPoint(pad.transform, { x: 0, y: 0 });
      // Use Arc for Circle (0 to 2PI)
      const circle = new Arc(
        pad.id,
        center,
        pad.size.w / 2,
        0,
        Math.PI * 2,
        false
      );
      // Map DrawStyle to ShapeStyle
      circle.style = {
        fill: style.fillColor,
        stroke: style.strokeColor,
        strokeWidth: style.lineWidth,
        opacity: style.opacity
      };
      (circle as any).zIndex = zIndex; 
      (circle as any).state = state;
      
      primitives.push(circle);

    } else if (pad.shape === 'rect') {
      const w = pad.size.w;
      const h = pad.size.h;
      // Local points relative to center
      const pts = [
        { x: -w/2, y: -h/2 },
        { x: w/2, y: -h/2 },
        { x: w/2, y: h/2 },
        { x: -w/2, y: h/2 }
      ].map(p => applyTransformToPoint(pad.transform, p));
      
      // Use Polygon
      // Construct Polyline for exterior
      const segments: Primitive[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i]!;
        const p2 = pts[(i + 1) % pts.length]!;
        segments.push(new Line(`${pad.id}_seg_${i}`, p1, p2));
      }
      
      const exterior = new Polyline(`${pad.id}_outline`, segments);
      const polygon = new Polygon(pad.id, exterior, []);
      
      polygon.style = {
        fill: style.fillColor,
        stroke: style.strokeColor,
        strokeWidth: style.lineWidth,
        opacity: style.opacity
      };
      (polygon as any).zIndex = zIndex;
      (polygon as any).state = state;

      primitives.push(polygon);
    } else if (pad.shape === 'roundedRect' || pad.shape === 'oval') {
       const w = pad.size.w;
       const h = pad.size.h;
       let radius = 0;
       
       if (pad.shape === 'oval') {
         radius = Math.min(w, h) / 2;
       } else {
         radius = Math.min(w, h) * 0.2; 
       }

       const roundedRect = this.createRoundedRectPrimitive(pad, w, h, radius, style);
       (roundedRect as any).zIndex = zIndex;
       (roundedRect as any).state = state;
       primitives.push(roundedRect);
    }

    // Drill Hole
    if (pad.drill && pad.drill.diameter > 0) {
      const drillCenter = applyTransformToPoint(pad.transform, pad.drill.offset || { x: 0, y: 0 });
      const hole = new Arc(
        `${pad.id}_drill`,
        drillCenter,
        pad.drill.diameter / 2,
        0,
        Math.PI * 2
      );
      hole.style = {
        fill: PCB_COLORS.PAD.THROUGH_HOLE,
        stroke: "transparent"
      };
      (hole as any).zIndex = zIndex + 10;
      (hole as any).state = "normal";
      primitives.push(hole);
    }

    return primitives;
  }

  private createRoundedRectPrimitive(
    pad: PadModel, 
    w: number, 
    h: number, 
    r: number, 
    style: DrawStyle
  ): Polygon {
    const rotation = Math.atan2(pad.transform.b, pad.transform.a);
    const t = (x: number, y: number) => applyTransformToPoint(pad.transform, { x, y });

    const segments: Primitive[] = [];
    
    // Top Line
    segments.push(new Line(`${pad.id}_top`, t(-w/2 + r, -h/2), t(w/2 - r, -h/2)));
    
    // TR Arc
    segments.push(new Arc(
      `${pad.id}_tr`,
      t(w/2 - r, -h/2 + r),
      r,
      -Math.PI / 2 + rotation,
      0 + rotation
    ));

    // Right Line
    segments.push(new Line(`${pad.id}_right`, t(w/2, -h/2 + r), t(w/2, h/2 - r)));

    // BR Arc
    segments.push(new Arc(
      `${pad.id}_br`,
      t(w/2 - r, h/2 - r),
      r,
      0 + rotation,
      Math.PI / 2 + rotation
    ));

    // Bottom Line
    segments.push(new Line(`${pad.id}_bottom`, t(w/2 - r, h/2), t(-w/2 + r, h/2)));

    // BL Arc
    segments.push(new Arc(
      `${pad.id}_bl`,
      t(-w/2 + r, h/2 - r),
      r,
      Math.PI / 2 + rotation,
      Math.PI + rotation
    ));

    // Left Line
    segments.push(new Line(`${pad.id}_left`, t(-w/2, h/2 - r), t(-w/2, -h/2 + r)));

    // TL Arc
    segments.push(new Arc(
      `${pad.id}_tl`,
      t(-w/2 + r, -h/2 + r),
      r,
      Math.PI + rotation,
      -Math.PI / 2 + rotation
    ));

    const exterior = new Polyline(`${pad.id}_outline`, segments);
    const polygon = new Polygon(pad.id, exterior, []);
    
    polygon.style = {
        fill: style.fillColor,
        stroke: style.strokeColor,
        strokeWidth: style.lineWidth,
        opacity: style.opacity
    };

    return polygon;
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

  private styleForState(state: DrawCommandState, base: DrawStyle): DrawStyle {
    if (state === "selected") {
      return { ...base, strokeColor: PCB_COLORS.SELECTION };
    }
    if (state === "hover") {
      return { ...base, strokeColor: PCB_COLORS.HOVER };
    }
    return base;
  }
}
