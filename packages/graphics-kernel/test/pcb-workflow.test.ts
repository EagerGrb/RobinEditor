
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
  UnitType,
  LayerType,
  PadShape
} from '../src/model/pcb.js';
import { ViewGenerator, ViewGeneratorInput } from '../src/view/ViewGenerator.js';
import { SceneModel, EntityModel, GridModel } from '../src/model/models.js';
import { DrawCommand, PolylineCommand, PolygonCommand } from '../src/view/drawCommands.js';

describe('PCB Workflow End-to-End', () => {
  it('should generate correct draw commands from PCB model', () => {
    // 1. Create PcbDocumentModel
    const header = new HeaderModel('doc-1', 'Test PCB', '1.0.0', Date.now(), Date.now());
    const settings = new SettingsModel('mm', { x: 0, y: 0 }, { spacing: 0.5, enabled: true });
    const board = new BoardModel('board-1');

    // Layers
    const topLayer = new LayerModel('L1', 'Top Layer', 'signal', 1, true, false, '#FF0000');
    const bottomLayer = new LayerModel('L2', 'Bottom Layer', 'signal', 2, true, false, '#0000FF');
    board.layerStack.layers.push(topLayer, bottomLayer);

    // Nets
    const net1 = new NetModel('net-1', 'GND');
    board.nets.set(net1.id, net1);

    // Footprint & Pad
    const footprint = new FootprintModel(
      'fp-1', 'R1', '0603', { x: 10, y: 10 }, 0, 'top', 'L1'
    );
    const pad = new PadModel(
      'pad-1', 'rect', { x: 0, y: 0 }, { w: 2, h: 2 }, 0, ['L1'], 'smt',
      footprint.id, '1', undefined, net1.id
    );
    // Inject layer color into metadata for ViewGenerator
    pad.metadata = { color: topLayer.color };
    
    footprint.padIds.push(pad.id);
    board.footprints.set(footprint.id, footprint);
    board.pads.set(pad.id, pad);

    // Track
    const trackPoints = [{ x: 20, y: 20 }, { x: 30, y: 30 }, { x: 40, y: 30 }];
    const track = new TrackModel('track-1', 'L1', 0.5, trackPoints, net1.id);
    // Inject layer color into metadata
    track.metadata = { color: topLayer.color };
    board.tracks.set(track.id, track);

    // 2. Instantiate ViewGenerator
    const viewGen = new ViewGenerator();

    // Prepare Input
    const entities: EntityModel[] = [
      footprint,
      pad,
      track
    ];

    const scene: SceneModel = {
      version: 1,
      entities
    };

    const grid: GridModel = { visible: true, size: 10, subdivisions: 5 };
    
    const input: ViewGeneratorInput = {
      grid,
      scene,
      selection: { selectedIds: new Set(), hoverId: null, marqueeRect: null },
      viewportWorldRect: { x: 0, y: 0, width: 100, height: 100 },
      ephemeral: []
    };

    // 3. Generate DrawCommands
    const commands = viewGen.generate(input);

    // 4. Verify
    // Filter out grid commands
    const entityCommands = commands.filter(c => c.id && !c.id.startsWith('grid_'));

    // Check Track Command
    const trackCmd = entityCommands.find(c => c.id === track.id) as PolylineCommand;
    assert.ok(trackCmd, 'Track command should be generated');
    assert.strictEqual(trackCmd.kind, 'polyline');
    assert.strictEqual(trackCmd.points.length, 3);
    assert.deepStrictEqual(trackCmd.points, trackPoints);
    assert.strictEqual(trackCmd.style?.strokeColor, '#FF0000');
    assert.strictEqual(trackCmd.style?.lineWidth, 0.5);

    // Check Pad Command
    const padCmd = entityCommands.find(c => c.id === pad.id);
    assert.ok(padCmd, 'Pad command should be generated');
    
    // Rect pads are now polygons
    assert.strictEqual(padCmd.kind, 'polygon');
    const padPoly = padCmd as PolygonCommand;
    
    // Check points length (rect has 4 points + 1 closing point)
    assert.strictEqual(padPoly.points.length, 5);

    assert.strictEqual(padPoly.style?.fillColor, '#FF0000'); // Pads use fill
    
    // Check Layer Order Sorting
    // Track is on L1 (zIndex should reflect layer order)
    // We haven't implemented zIndex mapping from Layer yet, but let's verify sort functionality exists
    // commands are sorted by zIndex.
  });
});
