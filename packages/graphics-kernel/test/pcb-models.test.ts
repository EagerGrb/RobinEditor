import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BoardModel,
  FootprintModel,
  LayerModel,
  LayerStackModel,
  NetModel,
  PadModel,
  PcbDocumentModel,
  TrackModel,
  ViaModel,
  HeaderModel,
  SettingsModel,
  CopperAreaModel,
  TextModel,
  DimensionModel,
  UnitType,
  LayerType,
  PadShape
} from '../src/model/pcb.js';

describe('PCB Models', () => {
  it('should create a complete PCB document structure', () => {
    // 1. Create Header and Settings
    const header = new HeaderModel(
      'doc-1',
      'Test PCB',
      '1.0.0',
      Date.now(),
      Date.now()
    );

    const settings = new SettingsModel(
      'mm' as UnitType,
      { x: 0, y: 0 },
      { spacing: 0.1, enabled: true }
    );

    // 2. Create Board
    const board = new BoardModel('board-1');

    // 3. Setup Layer Stack
    const topLayer = new LayerModel('L1', 'Top Layer', 'signal' as LayerType, 0, true, false, '#FF0000');
    const bottomLayer = new LayerModel('L2', 'Bottom Layer', 'signal' as LayerType, 1, true, false, '#0000FF');
    board.layerStack.layers.push(topLayer, bottomLayer);

    // 4. Create Nets
    const gndNet = new NetModel('net-1', 'GND');
    const vccNet = new NetModel('net-2', 'VCC');
    board.nets.set(gndNet.id, gndNet);
    board.nets.set(vccNet.id, vccNet);

    // 5. Create Footprint and Pads
    const footprint = new FootprintModel(
      'fp-1',
      'U1',
      'SOIC-8',
      { x: 10, y: 10 },
      90,
      'top',
      'L1'
    );
    
    const pad1 = new PadModel(
      'pad-1',
      'rect' as PadShape,
      { x: 0, y: 0 }, // Relative to footprint? Model definition takes absolute pos usually, let's assume absolute for now or handle transform later
      { w: 2, h: 2 },
      0,
      ['L1'],
      'smt', // padType
      footprint.id,
      '1',
      undefined,
      gndNet.id
    );

    footprint.padIds.push(pad1.id);
    
    board.footprints.set(footprint.id, footprint);
    board.pads.set(pad1.id, pad1);

    // 6. Create Track and Via
    const track = new TrackModel(
      'track-1',
      'L1',
      0.5,
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      gndNet.id
    );

    const via = new ViaModel(
      'via-1',
      { x: 10, y: 10 },
      0.3,
      0.6,
      ['L1', 'L2'],
      gndNet.id
    );

    board.tracks.set(track.id, track);
    board.vias.set(via.id, via);

    // 7. Create PcbDocument
    const doc = new PcbDocumentModel(header, settings, board);

    // Assertions
    assert.strictEqual(doc.header.title, 'Test PCB');
    assert.strictEqual(doc.board.layerStack.layers.length, 2);
    assert.strictEqual(doc.board.nets.get('net-1')?.name, 'GND');
    assert.strictEqual(doc.board.footprints.get('fp-1')?.ref, 'U1');
    assert.strictEqual(doc.board.pads.get('pad-1')?.shape, 'rect');
    assert.strictEqual(doc.board.tracks.get('track-1')?.width, 0.5);
    
    // Check EntityModel compatibility (transform/boundingBox)
    assert.ok(footprint.transform);
    // Transform2D is { a, b, c, d, e, f }
    // rotation 90 deg -> a=0, b=1, c=-1, d=0, e=10, f=10
    assert.ok(Math.abs(footprint.transform.e - 10) < 0.0001);
    assert.ok(Math.abs(footprint.transform.f - 10) < 0.0001);
    assert.ok(Math.abs(footprint.transform.a - 0) < 0.0001);
    assert.ok(Math.abs(footprint.transform.b - 1) < 0.0001);

    assert.ok(pad1.boundingBox);
    // Pad pos is 0,0, size 2x2. Box should be x=-1, y=-1, width=2, height=2
    assert.strictEqual(pad1.boundingBox.x, -1);
    assert.strictEqual(pad1.boundingBox.y, -1);
    assert.strictEqual(pad1.boundingBox.width, 2);
    assert.strictEqual(pad1.boundingBox.height, 2);
  });

  it('should support property provider interface', () => {
    const layer = new LayerModel('L1', 'Top', 'signal' as LayerType, 0, true, false, '#FF0000');
    
    assert.strictEqual(layer.getProperty('name'), 'Top');
    
    layer.setProperty('name', 'Top Layer Modified');
    assert.strictEqual(layer.getProperty('name'), 'Top Layer Modified');
    
    const schema = layer.getSchema();
    assert.ok(schema['name']);
    assert.ok(schema['color']);
  });
});
