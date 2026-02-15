
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ViaController } from './ViaController.js';
import { ViaModel } from '../model/pcb.js';

describe('ViaController', () => {
  let model: ViaModel;
  let controller: ViaController;

  beforeEach(() => {
    model = new ViaModel(
      'via-1',
      { x: 0, y: 0 },
      0.3,
      0.6,
      ['top', 'bottom']
    );
    controller = new ViaController(model);
  });

  it('should initialize with correct model', () => {
    assert.strictEqual(controller.getModel(), model);
  });

  it('should update position', () => {
    controller.setPosition(5, 5);
    assert.deepStrictEqual(model.position, { x: 5, y: 5 });
    assert.strictEqual(model.transform.e, 5);
    assert.strictEqual(model.transform.f, 5);
  });

  it('should update drill size', () => {
    controller.setDrill(0.4);
    assert.strictEqual(model.drill, 0.4);
  });

  it('should update diameter', () => {
    controller.setDiameter(0.8);
    assert.strictEqual(model.diameter, 0.8);
  });

  it('should update layers', () => {
    controller.setLayers(['MultiLayer']);
    assert.deepStrictEqual(model.layers, ['MultiLayer']);
  });

  it('should update netId', () => {
    controller.setNetId('GND');
    assert.strictEqual(model.netId, 'GND');
  });
});
