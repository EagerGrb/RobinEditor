import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Bezier, Polyline, Polygon, Line } from './primitive.js';
import { Vec2, Box2 } from '@render/geometry';

describe('Primitive Models', () => {
  describe('Bezier', () => {
    test('Bezier creation and clone()', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 10, y: 20 };
      const p2 = { x: 80, y: 20 };
      const p3 = { x: 100, y: 0 };
      
      const bezier = new Bezier('bezier-1', p0, p1, p2, p3);
      
      assert.strictEqual(bezier.id, 'bezier-1');
      assert.deepStrictEqual(bezier.p0, p0);
      assert.deepStrictEqual(bezier.p3, p3);

      const cloned = bezier.clone();
      assert.notStrictEqual(cloned, bezier);
      assert.strictEqual(cloned.id, bezier.id);
      assert.deepStrictEqual(cloned.p0, bezier.p0);
      assert.deepStrictEqual(cloned.p1, bezier.p1);
      assert.deepStrictEqual(cloned.p2, bezier.p2);
      assert.deepStrictEqual(cloned.p3, bezier.p3);
    });

    test('Bezier.getBounds() (check if control points are contained)', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 10, y: 50 };
      const p2 = { x: 90, y: 50 };
      const p3 = { x: 100, y: 0 };
      
      const bezier = new Bezier('bezier-bounds', p0, p1, p2, p3);
      const bounds = bezier.getBounds();

      // Check if all control points are within the bounds
      // The implementation uses convex hull of control points which guarantees containment
      assert.ok(bounds.min.x <= 0);
      assert.ok(bounds.min.y <= 0);
      assert.ok(bounds.max.x >= 100);
      assert.ok(bounds.max.y >= 50);

      // Verify specific values if implementation is known (Box2.create([p0, p1, p2, p3]))
      assert.strictEqual(bounds.min.x, 0);
      assert.strictEqual(bounds.min.y, 0);
      assert.strictEqual(bounds.max.x, 100);
      assert.strictEqual(bounds.max.y, 50);
    });
  });

  describe('Polyline', () => {
    test('Polyline creation and bounds', () => {
      const l1 = new Line('l1', { x: 0, y: 0 }, { x: 10, y: 0 });
      const l2 = new Line('l2', { x: 10, y: 0 }, { x: 10, y: 10 });
      
      const polyline = new Polyline('pl-1', [l1, l2]);
      
      assert.strictEqual(polyline.id, 'pl-1');
      assert.strictEqual(polyline.segments.length, 2);
      
      const bounds = polyline.getBounds();
      assert.strictEqual(bounds.min.x, 0);
      assert.strictEqual(bounds.min.y, 0);
      assert.strictEqual(bounds.max.x, 10);
      assert.strictEqual(bounds.max.y, 10);
    });
  });

  describe('Polygon', () => {
    test('Polygon creation', () => {
      // Create a triangle
      const l1 = new Line('l1', { x: 0, y: 0 }, { x: 10, y: 0 });
      const l2 = new Line('l2', { x: 10, y: 0 }, { x: 0, y: 10 });
      const l3 = new Line('l3', { x: 0, y: 10 }, { x: 0, y: 0 });
      
      const exterior = new Polyline('ext', [l1, l2, l3]);
      const polygon = new Polygon('poly-1', exterior);

      assert.strictEqual(polygon.id, 'poly-1');
      assert.strictEqual(polygon.exterior, exterior);
      assert.strictEqual(polygon.holes.length, 0);

      const bounds = polygon.getBounds();
      assert.strictEqual(bounds.min.x, 0);
      assert.strictEqual(bounds.min.y, 0);
      assert.strictEqual(bounds.max.x, 10);
      assert.strictEqual(bounds.max.y, 10);
    });
  });
});
