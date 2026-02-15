
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BoardModel,
  LayerModel,
  PadModel,
  TrackModel,
  ViaModel,
  NetModel
} from '../src/model/pcb.js';
import { ViewGenerator, ViewGeneratorInput } from '../src/view/ViewGenerator.js';
import { GridModel, SceneModel, EntityModel } from '../src/model/models.js';
import { PolylineCommand, PathCommand, CircleCommand, DrawCommand } from '../src/view/drawCommands.js';

describe('Visual Rendering Tests', () => {
  const createMockInput = (entities: EntityModel[], board?: BoardModel): ViewGeneratorInput => {
    return {
      grid: { visible: false, size: 10, subdivisions: 5 },
      scene: { version: 1, entities },
      board: board,
      selection: { selectedIds: new Set(), hoverId: null, marqueeRect: null },
      viewportWorldRect: { x: 0, y: 0, width: 100, height: 100 },
      ephemeral: []
    };
  };

  const createBasicBoard = () => {
    const board = new BoardModel('board-1');
    const topLayer = new LayerModel('L1', 'Top Layer', 'signal', 1, true, false, '#FF0000');
    board.layerStack.layers.push(topLayer);
    return { board, topLayer };
  };

  it('1. Track generates polyline command with round lineCap and lineJoin', () => {
    const { board, topLayer } = createBasicBoard();
    const trackPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    const track = new TrackModel('track-1', 'L1', 0.5, trackPoints);
    track.metadata = { color: topLayer.color };
    
    // Use board.tracks instead of scene.entities to use board rendering logic if needed,
    // but here we can just pass it as an entity if ViewGenerator supports it directly via entityToCommands
    // ViewGenerator iterates scene.entities AND board.tracks. Let's use scene.entities for isolation.
    
    const input = createMockInput([track], board);
    const viewGen = new ViewGenerator();
    const commands = viewGen.generate(input);

    const trackCmd = commands.find(c => c.id === track.id) as PolylineCommand;
    assert.ok(trackCmd, 'Track command should be generated');
    assert.strictEqual(trackCmd.kind, 'polyline');
    assert.strictEqual(trackCmd.style?.lineCap, 'round');
    assert.strictEqual(trackCmd.style?.lineJoin, 'round');
    assert.strictEqual(trackCmd.style?.strokeColor, '#FF0000');
  });

  it('2. Pad (RoundedRect) generates path command', () => {
    const { board } = createBasicBoard();
    const pad = new PadModel(
      'pad-1', 
      'roundedRect', 
      { x: 10, y: 10 }, 
      { w: 4, h: 2 }, 
      0, 
      ['L1'], 
      'smt', 
      'fp-1', '1'
    );
    pad.metadata = { color: '#00FF00' };

    const input = createMockInput([pad], board);
    const viewGen = new ViewGenerator();
    const commands = viewGen.generate(input);

    const padCmd = commands.find(c => c.id === pad.id) as PathCommand;
    assert.ok(padCmd, 'Pad command should be generated');
    
    // RoundedRect has mixed Line and Arc segments, so it should be a Path
    assert.strictEqual(padCmd.kind, 'path');
    assert.ok(padCmd.segments.length > 0, 'Should have segments');
    
    // Check for arcs in segments
    const hasArcs = padCmd.segments.some(s => s.kind === 'arc');
    assert.ok(hasArcs, 'Should contain arc segments for rounded corners');
    
    assert.strictEqual(padCmd.style?.fillColor, '#00FF00');
  });

  it('3. Via generates two circle/arc commands (Ring + Hole)', () => {
    const { board } = createBasicBoard();
    // Constructor: id, position, drill, diameter, layers, netId
    const via = new ViaModel('via-1', { x: 20, y: 20 }, 0.3, 0.6, ['L1', 'L2'], undefined);
    
    const input = createMockInput([via], board);
    const viewGen = new ViewGenerator();
    const commands = viewGen.generate(input);

    // Via generates multiple primitives. ViewGenerator flattens them.
    // ViaView generates ring with id 'via-1' and hole with id 'via-1_drill'
    
    const ringCmd = commands.find(c => c.id === via.id);
    const holeCmd = commands.find(c => c.id === `${via.id}_drill`);

    assert.ok(ringCmd, 'Via ring command should be generated');
    assert.ok(holeCmd, 'Via hole command should be generated');

    // They should be circles (Arc with full angle)
    assert.strictEqual(ringCmd.kind, 'circle');
    assert.strictEqual(holeCmd.kind, 'circle');
    
    // Check sizes
    const ring = ringCmd as CircleCommand;
    const hole = holeCmd as CircleCommand;
    
    assert.strictEqual(ring.radius, 0.3); // diameter 0.6 / 2
    assert.strictEqual(hole.radius, 0.15); // diameter 0.3 / 2
  });

  it('4. Correct colors are applied', () => {
    const { board, topLayer } = createBasicBoard();
    
    // Case A: Metadata override
    const track1 = new TrackModel('track-meta', 'L1', 0.5, [{x:0,y:0}, {x:10,y:0}]);
    track1.metadata = { color: '#123456' };
    
    // Case B: Layer color fallback
    const track2 = new TrackModel('track-layer', 'L1', 0.5, [{x:0,y:10}, {x:10,y:10}]);
    // No metadata
    
    const input = createMockInput([track1, track2], board);
    const viewGen = new ViewGenerator();
    const commands = viewGen.generate(input);

    const cmd1 = commands.find(c => c.id === track1.id);
    const cmd2 = commands.find(c => c.id === track2.id);

    assert.strictEqual(cmd1?.style?.strokeColor, '#123456', 'Should use metadata color');
    assert.strictEqual(cmd2?.style?.strokeColor, topLayer.color, 'Should use layer color');
  });
});
