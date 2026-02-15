
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ViaView } from './ViaView.js';
import { ViaModel } from '../../model/pcb.js';
import { Arc } from '../../model/primitive.js';
import { PCB_COLORS } from '../constants.js';

describe('ViaView', () => {
  const view = new ViaView();

  it('should render via ring and hole', () => {
    const model = new ViaModel(
      'via-1',
      { x: 10, y: 10 },
      0.3, // drill
      0.6, // diameter
      ['top', 'bottom']
    );

    const primitives = view.render(model, {
      state: 'normal',
      zMap: new Map([['top', 10], ['bottom', 0]])
    });

    assert.strictEqual(primitives.length, 2);

    const ring = primitives[0];
    assert.ok(ring instanceof Arc);
    assert.deepStrictEqual(ring.center, { x: 10, y: 10 });
    assert.strictEqual(ring.radius, 0.3); // diameter/2
    assert.strictEqual((ring as any).zIndex, 11); // maxZ + 1

    const hole = primitives[1];
    assert.ok(hole instanceof Arc);
    assert.strictEqual(hole.radius, 0.15); // drill/2
    assert.strictEqual((hole.style as any)?.fill, PCB_COLORS.PAD.THROUGH_HOLE);
  });

  it('should handle selection state', () => {
    const model = new ViaModel(
      'via-1',
      { x: 0, y: 0 },
      0.3,
      0.6,
      ['top']
    );

    const primitives = view.render(model, { state: 'selected' });
    const ring = primitives[0]!;
    
    assert.strictEqual(ring.style?.stroke, PCB_COLORS.SELECTION);
  });
});
