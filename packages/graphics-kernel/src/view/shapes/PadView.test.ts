
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PadView } from './PadView.js';
import { PadModel, LayerStackModel, LayerModel } from '../../model/pcb.js';
import { Arc, Polygon } from '../../model/primitive.js';
import { PCB_COLORS } from '../constants.js';

describe('PadView', () => {
  const view = new PadView();
  const layerStack = new LayerStackModel('stack-1');
  layerStack.layers.push(
    new LayerModel('l1', 'Top Layer', 'signal', 1, true, false, '#FF0000')
  );

  it('should render a circular pad', () => {
    const model = new PadModel(
      'pad-circle',
      'circle',
      { x: 10, y: 10 },
      { w: 5, h: 5 },
      0,
      ['l1'],
      'smt'
    );
    
    const primitives = view.render(model, {
      state: 'normal',
      layerStack,
      zMap: new Map([['l1', 10]])
    });

    assert.strictEqual(primitives.length, 1);
    const arc = primitives[0];
    assert.ok(arc instanceof Arc);
    assert.deepStrictEqual(arc.center, { x: 10, y: 10 });
    assert.strictEqual(arc.radius, 2.5); // w/2
    assert.strictEqual((arc as any).zIndex, 10);
    assert.strictEqual((arc.style as any)?.fill, '#FF0000');
  });

  it('should render a rectangular pad', () => {
    const model = new PadModel(
      'pad-rect',
      'rect',
      { x: 0, y: 0 },
      { w: 10, h: 6 },
      0,
      ['l1'],
      'smt'
    );

    const primitives = view.render(model, {
      state: 'selected',
      layerStack,
      zMap: new Map([['l1', 10]])
    });

    assert.strictEqual(primitives.length, 1);
    const poly = primitives[0];
    assert.ok(poly instanceof Polygon);
    assert.strictEqual(poly.style?.stroke, PCB_COLORS.SELECTION);
  });

  it('should render through-hole pad with drill', () => {
    const model = new PadModel(
      'pad-tht',
      'circle',
      { x: 0, y: 0 },
      { w: 2, h: 2 },
      0,
      ['MultiLayer'],
      'through',
      undefined,
      undefined,
      { diameter: 1 }
    );

    const primitives = view.render(model, {
      state: 'normal',
      layerStack
    });

    // Should have pad shape + drill hole
    assert.strictEqual(primitives.length, 2);
    
    const drill = primitives[1];
    assert.ok(drill instanceof Arc);
    assert.strictEqual(drill.radius, 0.5); // diameter/2
    assert.strictEqual((drill.style as any)?.fill, PCB_COLORS.PAD.THROUGH_HOLE);
  });
});
