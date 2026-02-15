import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GraphicsKernel } from '../src/kernel/GraphicsKernel.js';
import { InputPointerEvent } from '../src/tools/Tool.js';
import { TrackModel, PadModel, ViaModel } from '../src/model/pcb.js';

describe('Tool Interaction Integration', () => {
  const createPointerEvent = (
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    x: number,
    y: number,
    buttons: number = 0
  ): InputPointerEvent => ({
    type,
    pointerId: 1,
    buttons,
    worldPosition: { x, y }, // Note: Kernel recalculates this from screenPosition, but we provide it for completeness
    screenPosition: { x, y },
    modifiers: { shift: false, alt: false, ctrl: false, meta: false, space: false },
    timestamp: Date.now()
  });

  it('should create track entity on click-move-click (DrawTrackTool)', () => {
    const kernel = new GraphicsKernel();
    kernel.setTool({ type: 'track' });

    // 1. Down (Left) at P1 (0,0)
    kernel.handlePointerEvent(createPointerEvent('pointerdown', 0, 0, 1));
    kernel.handlePointerEvent(createPointerEvent('pointerup', 0, 0, 0));

    // 2. Move to P2 (50,50)
    kernel.handlePointerEvent(createPointerEvent('pointermove', 50, 50, 0));

    // 3. Down (Left) at P2 (50,50) -> Verify Track(P1-P2) created.
    kernel.handlePointerEvent(createPointerEvent('pointerdown', 50, 50, 1));
    kernel.handlePointerEvent(createPointerEvent('pointerup', 50, 50, 0));

    // Verify
    let scene = kernel.save();
    let track = scene.entities.find(e => e.type === 'TRACK') as TrackModel;
    
    assert.ok(track, 'Track entity should be created in the scene');
    assert.strictEqual(track.points.length, 2);
    assert.deepStrictEqual(track.points[0], { x: 0, y: 0 });
    assert.deepStrictEqual(track.points[1], { x: 50, y: 50 });

    // 4. Move to P3 (100, 50)
    kernel.handlePointerEvent(createPointerEvent('pointermove', 100, 50, 0));

    // 5. Down (Right) or Escape.
    // Using Right Click (buttons=2)
    kernel.handlePointerEvent(createPointerEvent('pointerdown', 100, 50, 2));
    kernel.handlePointerEvent(createPointerEvent('pointerup', 100, 50, 0));

    // Verify no extra track or correct state reset.
    scene = kernel.save();
    const tracks = scene.entities.filter(e => e.type === 'TRACK');
    assert.strictEqual(tracks.length, 1, 'Should have exactly 1 track after cancellation/completion');
  });

  it('should create pad entity on click (DrawPadTool)', () => {
    const kernel = new GraphicsKernel();
    kernel.setTool({ type: 'pad' });

    // Simulate Click at (100, 100)
    // Note: DrawPadTool creates entity on PointerUp
    kernel.handlePointerEvent(createPointerEvent('pointerdown', 100, 100, 1));
    kernel.handlePointerEvent(createPointerEvent('pointerup', 100, 100, 0));

    const scene = kernel.save();
    const pad = scene.entities.find(e => e.type === 'PAD') as PadModel;

    assert.ok(pad, 'Pad entity should be created in the scene');
    assert.deepStrictEqual(pad.position, { x: 100, y: 100 });
    assert.strictEqual(pad.shape, 'circle');
  });

  it('should create via entity on click (DrawViaTool)', () => {
    const kernel = new GraphicsKernel();
    kernel.setTool({ type: 'via' });

    // Simulate Click at (200, 200)
    kernel.handlePointerEvent(createPointerEvent('pointerdown', 200, 200, 1));
    kernel.handlePointerEvent(createPointerEvent('pointerup', 200, 200, 0));

    const scene = kernel.save();
    const via = scene.entities.find(e => e.type === 'VIA') as ViaModel;

    assert.ok(via, 'Via entity should be created in the scene');
    assert.deepStrictEqual(via.position, { x: 200, y: 200 });
  });
});
