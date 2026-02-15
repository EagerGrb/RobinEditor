import { TrackModel, LayerStackModel } from '../../model/pcb.js';
import { Primitive, Polyline, Line } from '../../model/primitive.js';
import { PCB_COLORS } from '../constants.js';
import { DrawCommandState, DrawStyle } from '../drawCommands.js';

export class TrackView {
  render(
    track: TrackModel,
    options: {
      state: DrawCommandState,
      layerStack?: LayerStackModel,
      zMap?: Map<string, number>
    }
  ): Primitive[] {
    const primitives: Primitive[] = [];
    const { state, layerStack, zMap } = options;

    const zIndex = zMap?.get(track.layerId) ?? 5000;
    let color = '#CCCCCC';

    if (track.metadata && typeof track.metadata['color'] === 'string') {
      color = track.metadata['color'];
    } else if (layerStack) {
      color = this.getLayerColor(track.layerId, layerStack);
    }

    const pts = track.points;
    
    if (pts.length < 2) return [];

    const segments: Primitive[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      segments.push(new Line(`${track.id}_seg_${i}`, a, b));
    }

    const polyline = new Polyline(track.id, segments);
    
    // Construct style with lineCap/lineJoin
    const drawStyle = this.styleForState(state, {
        strokeColor: color,
        lineWidth: track.width,
        opacity: 1
    });
    
    // Map to ShapeStyle
    const style: any = {
        stroke: drawStyle.strokeColor,
        strokeWidth: Math.max(drawStyle.lineWidth ?? 1, 1),
        opacity: drawStyle.opacity,
        lineCap: 'round',
        lineJoin: 'round',
        fill: "none"
    };
    
    polyline.style = style;
    (polyline as any).zIndex = zIndex;
    (polyline as any).state = state;

    primitives.push(polyline);

    return primitives;
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
