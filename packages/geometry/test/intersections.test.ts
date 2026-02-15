import test from "node:test";
import assert from "node:assert/strict";
import { intersect, evalPoint, type Arc2, type Bezier2, type Curve2, type Line2, type RBezier2 } from "../src/index.js";
import { Vec2 } from "../src/vec2.js";

function near(a: number, b: number, eps: number) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b} (eps=${eps})`);
}

function nearPoint(p: { x: number; y: number }, q: { x: number; y: number }, eps: number) {
  assert.ok(Vec2.dist(p, q) <= eps, `expected dist<=${eps}, got ${Vec2.dist(p, q)} p=${JSON.stringify(p)} q=${JSON.stringify(q)}`);
}

test("intersect: line-line single point", () => {
  const l0: Line2 = { kind: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
  const l1: Line2 = { kind: "line", a: { x: 0, y: 10 }, b: { x: 10, y: 0 } };
  const out = intersect(l0, l1, { distanceEpsilon: 1e-6 });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0]!.kind, "point");
  const it = out.items[0] as any;
  const p = evalPoint(l0, it.t0);
  nearPoint(p, { x: 5, y: 5 }, 1e-6);
});

test("intersect: line-line overlap", () => {
  const l0: Line2 = { kind: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
  const l1: Line2 = { kind: "line", a: { x: 5, y: 0 }, b: { x: 15, y: 0 } };
  const out = intersect(l0, l1, { distanceEpsilon: 1e-6 });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0]!.kind, "overlap");
  const seg = out.items[0] as any;
  const p0 = evalPoint(l0, seg.t0[0]);
  const p1 = evalPoint(l0, seg.t0[1]);
  nearPoint(p0, { x: 5, y: 0 }, 1e-6);
  nearPoint(p1, { x: 10, y: 0 }, 1e-6);
});

test("intersect: line-arc two points", () => {
  const line: Line2 = { kind: "line", a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
  const arc: Arc2 = { kind: "arc", c: { x: 0, y: 0 }, r: 5, start: 0, delta: Math.PI * 2 };
  const out = intersect(line, arc, { distanceEpsilon: 1e-6 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 2);
  const pA = evalPoint(line, pts[0].t0);
  const pB = evalPoint(line, pts[1].t0);
  const xs = [pA.x, pB.x].sort((a, b) => a - b);
  near(xs[0]!, -5, 1e-6);
  near(xs[1]!, 5, 1e-6);
  near(pA.y, 0, 1e-6);
  near(pB.y, 0, 1e-6);
});

test("intersect: arc-arc two points", () => {
  const a0: Arc2 = { kind: "arc", c: { x: 0, y: 0 }, r: 5, start: 0, delta: Math.PI * 2 };
  const a1: Arc2 = { kind: "arc", c: { x: 6, y: 0 }, r: 5, start: 0, delta: Math.PI * 2 };
  const out = intersect(a0, a1, { distanceEpsilon: 1e-6 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.equal(pts.length, 2);
  const p0 = evalPoint(a0, pts[0].t0);
  const p1 = evalPoint(a0, pts[1].t0);
  nearPoint({ x: p0.x, y: Math.abs(p0.y) }, { x: 3, y: 4 }, 1e-6);
  nearPoint({ x: p1.x, y: Math.abs(p1.y) }, { x: 3, y: 4 }, 1e-6);
});

test("intersect: arc-arc overlap on same circle", () => {
  const a0: Arc2 = { kind: "arc", c: { x: 0, y: 0 }, r: 5, start: 0, delta: Math.PI };
  const a1: Arc2 = { kind: "arc", c: { x: 0, y: 0 }, r: 5, start: Math.PI / 2, delta: Math.PI };
  const out = intersect(a0, a1, { distanceEpsilon: 1e-6 });
  assert.ok(out.items.some((x) => x.kind === "overlap"));
  const seg = out.items.find((x) => x.kind === "overlap") as any;
  const pStart = evalPoint(a0, seg.t0[0]);
  const pEnd = evalPoint(a0, seg.t0[1]);
  nearPoint(pStart, { x: 0, y: 5 }, 1e-5);
  nearPoint(pEnd, { x: -5, y: 0 }, 1e-5);
});

test("intersect: line-bezier (cubic) approx", () => {
  const bez: Bezier2 = {
    kind: "bezier",
    degree: 3,
    cp: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 7, y: 7 },
      { x: 10, y: 10 }
    ]
  };
  const line: Line2 = { kind: "line", a: { x: -2, y: 5 }, b: { x: 12, y: 5 } };
  const out = intersect(bez, line, { distanceEpsilon: 1e-4, maxDepth: 30 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 1);
  const p = evalPoint(bez, pts[0].t0);
  nearPoint(p, { x: 5, y: 5 }, 5e-3);
});

test("intersect: bezier-bezier approx", () => {
  const b0: Bezier2 = {
    kind: "bezier",
    degree: 3,
    cp: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 7, y: 7 },
      { x: 10, y: 10 }
    ]
  };
  const b1: Bezier2 = {
    kind: "bezier",
    degree: 3,
    cp: [
      { x: 0, y: 10 },
      { x: 3, y: 7 },
      { x: 7, y: 3 },
      { x: 10, y: 0 }
    ]
  };
  const out = intersect(b0, b1, { distanceEpsilon: 1e-4, maxDepth: 32 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 1);
  const p = evalPoint(b0, pts[0].t0);
  nearPoint(p, { x: 5, y: 5 }, 5e-2);
});

test("intersect: line-rational-bezier approx", () => {
  const rb: RBezier2 = {
    kind: "rbezier",
    degree: 3,
    cp: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 7, y: 7 },
      { x: 10, y: 10 }
    ],
    w: [1, 1, 1, 1]
  };
  const line: Line2 = { kind: "line", a: { x: -2, y: 5 }, b: { x: 12, y: 5 } };
  const out = intersect(rb, line, { distanceEpsilon: 1e-4, maxDepth: 30 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 1);
  const p = evalPoint(rb, pts[0].t0);
  nearPoint(p, { x: 5, y: 5 }, 5e-3);
});

test("intersect: arc-bezier approx", () => {
  const arc: Arc2 = { kind: "arc", c: { x: 0, y: 0 }, r: 5, start: 0, delta: Math.PI * 2 };
  const bez: Bezier2 = {
    kind: "bezier",
    degree: 3,
    cp: [
      { x: -10, y: 0 },
      { x: -3, y: 0 },
      { x: 3, y: 0 },
      { x: 10, y: 0 }
    ]
  };
  const out = intersect(arc, bez, { distanceEpsilon: 1e-4, maxDepth: 30 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 2);
  const p0 = evalPoint(arc, pts[0].t0);
  const p1 = evalPoint(arc, pts[1].t0);
  const xs = [p0.x, p1.x].sort((a, b) => a - b);
  near(xs[0]!, -5, 1e-2);
  near(xs[1]!, 5, 1e-2);
});

test("intersect: bezier-rational-bezier approx", () => {
  const b0: Bezier2 = {
    kind: "bezier",
    degree: 3,
    cp: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 7, y: 7 },
      { x: 10, y: 10 }
    ]
  };
  const b1: RBezier2 = {
    kind: "rbezier",
    degree: 3,
    cp: [
      { x: 0, y: 10 },
      { x: 3, y: 7 },
      { x: 7, y: 3 },
      { x: 10, y: 0 }
    ],
    w: [1, 1, 1, 1]
  };
  const out = intersect(b0, b1, { distanceEpsilon: 1e-4, maxDepth: 32 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 1);
  const p = evalPoint(b0, pts[0].t0);
  nearPoint(p, { x: 5, y: 5 }, 5e-2);
});

test("intersect: rational-bezier-rational-bezier approx", () => {
  const b0: RBezier2 = {
    kind: "rbezier",
    degree: 3,
    cp: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 7, y: 7 },
      { x: 10, y: 10 }
    ],
    w: [1, 1, 1, 1]
  };
  const b1: RBezier2 = {
    kind: "rbezier",
    degree: 3,
    cp: [
      { x: 0, y: 10 },
      { x: 3, y: 7 },
      { x: 7, y: 3 },
      { x: 10, y: 0 }
    ],
    w: [1, 1, 1, 1]
  };
  const out = intersect(b0, b1, { distanceEpsilon: 1e-4, maxDepth: 32 });
  const pts = out.items.filter((x) => x.kind === "point") as any[];
  assert.ok(pts.length >= 1);
  const p = evalPoint(b0, pts[0].t0);
  nearPoint(p, { x: 5, y: 5 }, 5e-2);
});

test("intersect: singular inputs yield no items", () => {
  const l0: Line2 = { kind: "line", a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
  const l1: Line2 = { kind: "line", a: { x: 0, y: 10 }, b: { x: 10, y: 0 } };
  const out = intersect(l0, l1, { distanceEpsilon: 1e-6 });
  assert.equal(out.items.length, 0);
  assert.equal(out.isSingularity0, true);
});
