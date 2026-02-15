import { ViaModel, LayerStackModel } from '../../model/pcb.js';
import { Primitive, Arc } from '../../model/primitive.js';
import { PCB_COLORS } from '../constants.js';
import { DrawCommandState, DrawStyle } from '../drawCommands.js';
import { applyTransformToPoint } from '../../math/transform.js';

export class ViaView {
  render(
    via: ViaModel, 
    options: {
      state: DrawCommandState, 
      layerStack?: LayerStackModel, 
      zMap?: Map<string, number>
    }
  ): Primitive[] {
    const primitives: Primitive[] = [];
    const { state, zMap } = options;
    
    const center = applyTransformToPoint(via.transform, { x: 0, y: 0 });

    let maxZ = 5000; // Default base Z
    if (zMap && via.layers.length > 0) {
        let foundZ = 0;
        via.layers.forEach(lid => {
            const z = zMap.get(lid) || 0;
            if (z > foundZ) foundZ = z;
        });
        if (foundZ > 0) maxZ = foundZ;
    }

    const color = PCB_COLORS.PAD.PLATING_BAR;

    // Construct style
    const drawStyle = this.styleForState(state, {
        strokeColor: state === 'selected' || state === 'hover' ? '#fff' : undefined,
        fillColor: color,
        lineWidth: 0.1,
        opacity: 1
    });
    
    // Map to ShapeStyle
    const style: any = {
        fill: drawStyle.fillColor,
        stroke: drawStyle.strokeColor,
        strokeWidth: drawStyle.lineWidth,
        opacity: drawStyle.opacity
    };

    // Via Ring
    const ring = new Arc(
        via.id,
        center,
        via.diameter / 2,
        0,
        Math.PI * 2
    );
    ring.style = style;
    (ring as any).zIndex = maxZ + 1;
    (ring as any).state = state;
    primitives.push(ring);

    // Via Hole
    const hole = new Arc(
        `${via.id}_drill`,
        center,
        via.drill / 2,
        0,
        Math.PI * 2
    );
    hole.style = {
        fill: PCB_COLORS.PAD.THROUGH_HOLE,
        stroke: "transparent"
    };
    (hole as any).zIndex = maxZ + 2;
    (hole as any).state = "normal";
    primitives.push(hole);

    return primitives;
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
