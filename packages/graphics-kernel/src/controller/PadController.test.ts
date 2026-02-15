
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PadController } from './PadController.js';
import { PadModel } from '../model/pcb.js';

describe('PadController', () => {
  let model: PadModel;
  let controller: PadController;

  beforeEach(() => {
    model = new PadModel(
      'pad-1',
      'rect',
      { x: 0, y: 0 },
      { w: 10, h: 10 },
      0,
      ['top'],
      'smt'
    );
    controller = new PadController(model);
  });

  it('should initialize with correct model', () => {
    assert.strictEqual(controller.getModel(), model);
  });

  it('should update position', () => {
    controller.setPosition(10, 20);
    assert.deepStrictEqual(model.position, { x: 10, y: 20 });
    assert.strictEqual(model.transform.e, 10);
    assert.strictEqual(model.transform.f, 20);
  });

  it('should update rotation', () => {
    controller.setRotation(90);
    assert.strictEqual(model.rotation, 90);
    assert.ok(Math.abs(model.transform.a - 0) < 0.0001);
    assert.ok(Math.abs(model.transform.b - 1) < 0.0001);
  });

  it('should update size', () => {
    controller.setSize(20, 30);
    assert.deepStrictEqual(model.size, { w: 20, h: 30 });
  });

  it('should update layers', () => {
    controller.setLayers(['top', 'bottom']);
    assert.deepStrictEqual(model.layers, ['top', 'bottom']);
  });

  it('should update netId', () => {
    controller.setNetId('net-1');
    assert.strictEqual(model.netId, 'net-1');
  });
});
