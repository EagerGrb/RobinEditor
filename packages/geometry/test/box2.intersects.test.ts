import test from "node:test";
import assert from "node:assert/strict";
import { Box2 } from "../src/box2.js";

function box(minX: number, minY: number, maxX: number, maxY: number) {
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

test("Box2.intersects: disjoint (separated on x)", () => {
  const a = box(0, 0, 10, 10);
  const b = box(11, 0, 20, 10);
  assert.equal(Box2.intersects(a, b), false);
  assert.equal(Box2.intersects(b, a), false);
});

test("Box2.intersects: disjoint (separated on y)", () => {
  const a = box(0, 0, 10, 10);
  const b = box(0, 11, 10, 20);
  assert.equal(Box2.intersects(a, b), false);
});

test("Box2.intersects: overlap area", () => {
  const a = box(0, 0, 10, 10);
  const b = box(5, 5, 15, 15);
  assert.equal(Box2.intersects(a, b), true);
});

test("Box2.intersects: containment (b inside a)", () => {
  const a = box(0, 0, 10, 10);
  const b = box(2, 2, 3, 3);
  assert.equal(Box2.intersects(a, b), true);
});

test("Box2.intersects: touch on edge is treated as intersect (inclusive)", () => {
  const a = box(0, 0, 10, 10);
  const b = box(10, 2, 12, 8); // share vertical edge x=10
  assert.equal(Box2.intersects(a, b), true);
});

test("Box2.intersects: touch at corner is treated as intersect (inclusive)", () => {
  const a = box(0, 0, 10, 10);
  const b = box(10, 10, 12, 12); // share point (10,10)
  assert.equal(Box2.intersects(a, b), true);
});

test("Box2.intersects: degenerate boxes (point vs box)", () => {
  const a = box(0, 0, 10, 10);
  const pInside = box(3, 3, 3, 3);
  const pOutside = box(11, 3, 11, 3);
  assert.equal(Box2.intersects(a, pInside), true);
  assert.equal(Box2.intersects(a, pOutside), false);
});

test("Box2.intersects: empty box created by Box2.create([]) never intersects normal boxes", () => {
  const empty = Box2.create([]);
  const a = box(0, 0, 10, 10);
  assert.equal(Box2.intersects(empty, a), false);
  assert.equal(Box2.intersects(a, empty), false);
});

