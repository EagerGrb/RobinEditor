import { Vec2 } from "./vec2.js";
import type { Arc2, Curve2, CurveCurveIntersections, IntersectOptions, IntersectionOverlap, IntersectionPoint, Line2 } from "./curves.js";

const DEFAULT_MAX_DEPTH = 28;
const DEFAULT_MAX_CANDIDATES = 2048;
const EPS0 = 1e-12;

type Aabb = { min: Vec2; max: Vec2 };

export function evalPoint(curve: Curve2, t: number): Vec2 {
  const tt = clamp01(t);
  if (curve.kind === "line") {
    return {
      x: curve.a.x + (curve.b.x - curve.a.x) * tt,
      y: curve.a.y + (curve.b.y - curve.a.y) * tt
    };
  }
  if (curve.kind === "arc") {
    const a = curve.start + curve.delta * tt;
    return { x: curve.c.x + curve.r * Math.cos(a), y: curve.c.y + curve.r * Math.sin(a) };
  }
  if (curve.kind === "bezier") {
    return evalBezier(curve.cp, tt);
  }
  return evalRBezier(curve.cp, curve.w, tt);
}

export function intersect(curve0: Curve2, curve1: Curve2, opt: IntersectOptions): CurveCurveIntersections {
  const distanceEpsilon = Math.max(0, opt.distanceEpsilon);
  const maxDepth = opt.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxCandidates = opt.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const singular0 = isSingular(curve0);
  const singular1 = isSingular(curve1);
  if (singular0 || singular1) return { isSingularity0: singular0, isSingularity1: singular1, items: [] };

  const items: Array<IntersectionPoint | IntersectionOverlap> = [];

  if (curve0.kind === "line" && curve1.kind === "line") {
    items.push(...intersectLineLine(curve0, curve1, distanceEpsilon));
    return { isSingularity0: false, isSingularity1: false, items: dedupeItems(items, curve0, curve1, distanceEpsilon) };
  }

  if (curve0.kind === "line" && curve1.kind === "arc") {
    items.push(...intersectLineArc(curve0, curve1, distanceEpsilon));
    return { isSingularity0: false, isSingularity1: false, items: dedupeItems(items, curve0, curve1, distanceEpsilon) };
  }

  if (curve0.kind === "arc" && curve1.kind === "line") {
    const swapped = intersectLineArc(curve1, curve0, distanceEpsilon).map((it) => swapIntersection(it));
    items.push(...swapped);
    return { isSingularity0: false, isSingularity1: false, items: dedupeItems(items, curve0, curve1, distanceEpsilon) };
  }

  if (curve0.kind === "arc" && curve1.kind === "arc") {
    items.push(...intersectArcArc(curve0, curve1, distanceEpsilon));
    return { isSingularity0: false, isSingularity1: false, items: dedupeItems(items, curve0, curve1, distanceEpsilon) };
  }

  if (curve0.kind === "bezier" || curve0.kind === "rbezier" || curve1.kind === "bezier" || curve1.kind === "rbezier") {
    items.push(...intersectByFlattening(curve0, curve1, distanceEpsilon));
    if (items.length > 0) return { isSingularity0: false, isSingularity1: false, items: dedupeItems(items, curve0, curve1, distanceEpsilon) };
  }

  items.push(...intersectBySubdivision(curve0, curve1, distanceEpsilon, maxDepth, maxCandidates));
  return { isSingularity0: false, isSingularity1: false, items: dedupeItems(items, curve0, curve1, distanceEpsilon) };
}

function intersectByFlattening(c0: Curve2, c1: Curve2, eps: number): IntersectionPoint[] {
  const segs = eps > 0 ? Math.max(16, Math.min(256, Math.ceil(1 / Math.max(eps, 1e-6)) * 2)) : 64;
  const a = flattenCurve(c0, segs);
  const b = flattenCurve(c1, segs);
  const out: IntersectionPoint[] = [];
  if (a && b) {
    for (let i = 0; i < a.points.length - 1; i++) {
      const a0 = a.points[i]!;
      const a1 = a.points[i + 1]!;
      const ta0 = a.ts[i]!;
      const ta1 = a.ts[i + 1]!;
      const la: Line2 = { kind: "line", a: a0, b: a1 };

      for (let j = 0; j < b.points.length - 1; j++) {
        const b0 = b.points[j]!;
        const b1 = b.points[j + 1]!;
        const tb0 = b.ts[j]!;
        const tb1 = b.ts[j + 1]!;
        const lb: Line2 = { kind: "line", a: b0, b: b1 };

        const ix = intersectLineLine(la, lb, eps);
        for (const it of ix) {
          if (it.kind !== "point") continue;
          const t0 = ta0 + (ta1 - ta0) * it.t0;
          const t1 = tb0 + (tb1 - tb0) * it.t1;
          out.push({ kind: "point", t0: clamp01(t0), t1: clamp01(t1), isSample: it.isSample });
        }
      }
    }

    if (out.length > 0) return out;
  }

  if ((c0.kind === "arc" || c1.kind === "arc") && (c0.kind === "bezier" || c0.kind === "rbezier" || c1.kind === "bezier" || c1.kind === "rbezier")) {
    const arcFirst = c0.kind === "arc";
    const arc = (arcFirst ? c0 : c1) as Arc2;
    const curve = arcFirst ? c1 : c0;
    const flat = flattenCurve(curve, segs);
    if (!flat) return [];
    for (let i = 0; i < flat.points.length - 1; i++) {
      const p0 = flat.points[i]!;
      const p1 = flat.points[i + 1]!;
      const tA = flat.ts[i]!;
      const tB = flat.ts[i + 1]!;
      const ln: Line2 = { kind: "line", a: p0, b: p1 };
      const pts = intersectLineArc(ln, arc, eps);
      for (const it of pts) {
        const tCurve = tA + (tB - tA) * it.t0;
        if (arcFirst) out.push({ kind: "point", t0: it.t1, t1: tCurve, isSample: it.isSample });
        else out.push({ kind: "point", t0: tCurve, t1: it.t1, isSample: it.isSample });
      }
    }
    return out;
  }

  return [];
}

function flattenCurve(curve: Curve2, segments: number): { points: Vec2[]; ts: number[] } | null {
  if (curve.kind === "line") return { points: [curve.a, curve.b], ts: [0, 1] };
  if (curve.kind !== "bezier" && curve.kind !== "rbezier") return null;
  const pts: Vec2[] = [];
  const ts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push(evalPoint(curve, t));
    ts.push(t);
  }
  return { points: pts, ts };
}

function isSingular(curve: Curve2): boolean {
  if (curve.kind === "line") return Vec2.lenSq(Vec2.sub(curve.b, curve.a)) <= EPS0;
  if (curve.kind === "arc") return !(Number.isFinite(curve.r) && curve.r > EPS0) || Math.abs(curve.delta) <= EPS0;
  if (curve.kind === "bezier") return curve.degree < 1 || curve.degree > 15 || curve.cp.length !== curve.degree + 1;
  if (curve.degree < 1 || curve.degree > 15) return true;
  if (curve.cp.length !== curve.degree + 1 || curve.w.length !== curve.degree + 1) return true;
  for (const w of curve.w) {
    if (!Number.isFinite(w) || Math.abs(w) <= EPS0) return true;
  }
  return false;
}

function intersectLineLine(l0: Line2, l1: Line2, eps: number): Array<IntersectionPoint | IntersectionOverlap> {
  const p = l0.a;
  const r = Vec2.sub(l0.b, l0.a);
  const q = l1.a;
  const s = Vec2.sub(l1.b, l1.a);
  const rxs = Vec2.cross(r, s);
  const q_p = Vec2.sub(q, p);
  const qpxr = Vec2.cross(q_p, r);

  if (Math.abs(rxs) <= EPS0 && Math.abs(qpxr) <= EPS0) {
    const rr = Vec2.dot(r, r);
    if (rr <= EPS0) return [];
    const t0 = Vec2.dot(Vec2.sub(q, p), r) / rr;
    const t1 = Vec2.dot(Vec2.sub(Vec2.add(q, s), p), r) / rr;
    const a = Math.min(t0, t1);
    const b = Math.max(t0, t1);
    const lo = Math.max(0, a);
    const hi = Math.min(1, b);
    if (hi < lo - eps) return [];
    if (Math.abs(hi - lo) <= eps) {
      const t = clamp01((lo + hi) / 2);
      const u = projectPointToSegment(evalPoint(l0, t), l1);
      return [{ kind: "point", t0: t, t1: u, isSample: true }];
    }
    const tMid0 = clamp01(lo);
    const tMid1 = clamp01(hi);
    const u0 = projectPointToSegment(evalPoint(l0, tMid0), l1);
    const u1 = projectPointToSegment(evalPoint(l0, tMid1), l1);
    return [{ kind: "overlap", t0: [tMid0, tMid1], t1: [u0, u1], isSample: [true, true] }];
  }

  if (Math.abs(rxs) <= EPS0 && Math.abs(qpxr) > EPS0) return [];

  const t = Vec2.cross(q_p, s) / rxs;
  const u = Vec2.cross(q_p, r) / rxs;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return [];
  return [{ kind: "point", t0: clamp01(t), t1: clamp01(u), isSample: false }];
}

function intersectLineArc(line: Line2, arc: Arc2, eps: number): IntersectionPoint[] {
  const d = Vec2.sub(line.b, line.a);
  const f = Vec2.sub(line.a, arc.c);

  const a = Vec2.dot(d, d);
  const b = 2 * Vec2.dot(f, d);
  const c = Vec2.dot(f, f) - arc.r * arc.r;

  const disc = b * b - 4 * a * c;
  if (disc < -eps) return [];

  const out: IntersectionPoint[] = [];
  const sqrtDisc = disc < 0 ? 0 : Math.sqrt(Math.max(0, disc));
  const inv2a = 1 / (2 * a);

  const tCandidates = disc === 0 ? [(-b) * inv2a] : [(-b - sqrtDisc) * inv2a, (-b + sqrtDisc) * inv2a];

  for (const t0 of tCandidates) {
    if (t0 < -eps || t0 > 1 + eps) continue;
    const p = { x: line.a.x + d.x * t0, y: line.a.y + d.y * t0 };
    const t1 = arcTForPoint(arc, p);
    if (t1 == null) continue;
    if (t1 < -eps || t1 > 1 + eps) continue;
    out.push({ kind: "point", t0: clamp01(t0), t1: clamp01(t1), isSample: false });
  }

  const pA = line.a;
  const pB = line.b;
  const r = arc.r;
  const da = Math.abs(Vec2.len(Vec2.sub(pA, arc.c)) - r);
  const db = Math.abs(Vec2.len(Vec2.sub(pB, arc.c)) - r);
  if (da <= eps) {
    const t1 = arcTForPoint(arc, pA);
    if (t1 != null && t1 >= -eps && t1 <= 1 + eps) out.push({ kind: "point", t0: 0, t1: clamp01(t1), isSample: true });
  }
  if (db <= eps) {
    const t1 = arcTForPoint(arc, pB);
    if (t1 != null && t1 >= -eps && t1 <= 1 + eps) out.push({ kind: "point", t0: 1, t1: clamp01(t1), isSample: true });
  }

  return out;
}

function intersectArcArc(a0: Arc2, a1: Arc2, eps: number): Array<IntersectionPoint | IntersectionOverlap> {
  const c0 = a0.c;
  const c1 = a1.c;
  const r0 = a0.r;
  const r1 = a1.r;
  const dc = Vec2.sub(c1, c0);
  const d = Vec2.len(dc);

  if (d <= eps && Math.abs(r0 - r1) <= eps) {
    const i0 = arcInterval(a0);
    const i1 = arcInterval(a1);
    const overlaps = intersectAngleIntervals(i0, i1, eps);
    const out: Array<IntersectionPoint | IntersectionOverlap> = [];
    for (const [s, e] of overlaps) {
      const t00 = arcTFromAngle(a0, s);
      const t01 = arcTFromAngle(a0, e);
      const t10 = arcTFromAngle(a1, s);
      const t11 = arcTFromAngle(a1, e);
      if (t00 == null || t01 == null || t10 == null || t11 == null) continue;
      const lo0 = clamp01(t00);
      const hi0 = clamp01(t01);
      const lo1 = clamp01(t10);
      const hi1 = clamp01(t11);
      if (Math.abs(hi0 - lo0) <= eps && Math.abs(hi1 - lo1) <= eps) {
        out.push({ kind: "point", t0: lo0, t1: lo1, isSample: true });
      } else {
        out.push({ kind: "overlap", t0: [lo0, hi0], t1: [lo1, hi1], isSample: [true, true] });
      }
    }
    return out;
  }

  if (d > r0 + r1 + eps) return [];
  if (d < Math.abs(r0 - r1) - eps) return [];
  if (d <= EPS0) return [];

  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  if (h2 < -eps) return [];
  const h = h2 <= 0 ? 0 : Math.sqrt(Math.max(0, h2));

  const ux = dc.x / d;
  const uy = dc.y / d;
  const px = c0.x + a * ux;
  const py = c0.y + a * uy;

  const rx = -uy * h;
  const ry = ux * h;

  const p1 = { x: px + rx, y: py + ry };
  const p2 = { x: px - rx, y: py - ry };

  const out: IntersectionPoint[] = [];
  const t00 = arcTForPoint(a0, p1);
  const t10 = arcTForPoint(a1, p1);
  if (t00 != null && t10 != null && t00 >= -eps && t00 <= 1 + eps && t10 >= -eps && t10 <= 1 + eps) {
    out.push({ kind: "point", t0: clamp01(t00), t1: clamp01(t10), isSample: false });
  }
  if (Vec2.distSq(p1, p2) > eps * eps) {
    const t01 = arcTForPoint(a0, p2);
    const t11 = arcTForPoint(a1, p2);
    if (t01 != null && t11 != null && t01 >= -eps && t01 <= 1 + eps && t11 >= -eps && t11 <= 1 + eps) {
      out.push({ kind: "point", t0: clamp01(t01), t1: clamp01(t11), isSample: false });
    }
  }
  return out;
}

function intersectBySubdivision(
  c0: Curve2,
  c1: Curve2,
  eps: number,
  maxDepth: number,
  maxCandidates: number,
): IntersectionPoint[] {
  const candidates: { t0: [number, number]; t1: [number, number]; depth: number }[] = [{ t0: [0, 1], t1: [0, 1], depth: 0 }];
  const results: IntersectionPoint[] = [];

  while (candidates.length > 0) {
    if (results.length > maxCandidates) break;
    const node = candidates.pop()!;
    const b0 = curveBounds(c0, node.t0[0], node.t0[1]);
    const b1 = curveBounds(c1, node.t1[0], node.t1[1]);
    if (!aabbIntersects(b0, b1, eps)) continue;

    const size0 = Math.max(b0.max.x - b0.min.x, b0.max.y - b0.min.y);
    const size1 = Math.max(b1.max.x - b1.min.x, b1.max.y - b1.min.y);

    if (node.depth >= maxDepth || (size0 <= eps && size1 <= eps)) {
      const t0m = (node.t0[0] + node.t0[1]) / 2;
      const t1m = (node.t1[0] + node.t1[1]) / 2;
      const refined = refinePair(c0, c1, t0m, t1m, node.t0, node.t1, eps) ?? coarsePairSearch(c0, c1, node.t0, node.t1, eps);
      if (!refined) continue;
      results.push({ kind: "point", t0: refined.t0, t1: refined.t1, isSample: false });
      continue;
    }

    if (size0 >= size1) {
      const mid = (node.t0[0] + node.t0[1]) / 2;
      candidates.push({ t0: [node.t0[0], mid], t1: node.t1, depth: node.depth + 1 });
      candidates.push({ t0: [mid, node.t0[1]], t1: node.t1, depth: node.depth + 1 });
    } else {
      const mid = (node.t1[0] + node.t1[1]) / 2;
      candidates.push({ t0: node.t0, t1: [node.t1[0], mid], depth: node.depth + 1 });
      candidates.push({ t0: node.t0, t1: [mid, node.t1[1]], depth: node.depth + 1 });
    }
  }

  return results;
}

function refinePair(
  c0: Curve2,
  c1: Curve2,
  t0Init: number,
  t1Init: number,
  t0Range: [number, number],
  t1Range: [number, number],
  eps: number,
): { t0: number; t1: number } | null {
  let t0 = clamp(t0Init, t0Range[0], t0Range[1]);
  let t1 = clamp(t1Init, t1Range[0], t1Range[1]);
  const step = Math.max(eps * 0.1, 1e-6);

  for (let i = 0; i < 8; i++) {
    const p0 = evalPoint(c0, t0);
    const p1 = evalPoint(c1, t1);
    const fx = p0.x - p1.x;
    const fy = p0.y - p1.y;
    const err = Math.hypot(fx, fy);
    if (err <= eps * 2) return { t0: clamp01(t0), t1: clamp01(t1) };

    const p0a = evalPoint(c0, clamp(t0 + step, 0, 1));
    const p0b = evalPoint(c0, clamp(t0 - step, 0, 1));
    const dx0 = (p0a.x - p0b.x) / (2 * step);
    const dy0 = (p0a.y - p0b.y) / (2 * step);

    const p1a = evalPoint(c1, clamp(t1 + step, 0, 1));
    const p1b = evalPoint(c1, clamp(t1 - step, 0, 1));
    const dx1 = (p1a.x - p1b.x) / (2 * step);
    const dy1 = (p1a.y - p1b.y) / (2 * step);

    const a = dx0;
    const b = -dx1;
    const c = dy0;
    const d = -dy1;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || Math.abs(det) <= 1e-14) break;

    const invDet = 1 / det;
    const dt0 = (d * (-fx) - b * (-fy)) * invDet;
    const dt1 = (-c * (-fx) + a * (-fy)) * invDet;

    if (!Number.isFinite(dt0) || !Number.isFinite(dt1)) break;

    t0 = clamp(t0 + dt0, t0Range[0], t0Range[1]);
    t1 = clamp(t1 + dt1, t1Range[0], t1Range[1]);
  }

  const p0 = evalPoint(c0, t0);
  const p1 = evalPoint(c1, t1);
  if (Vec2.dist(p0, p1) <= eps * 2) return { t0: clamp01(t0), t1: clamp01(t1) };
  return null;
}

function coarsePairSearch(
  c0: Curve2,
  c1: Curve2,
  t0Range: [number, number],
  t1Range: [number, number],
  eps: number,
): { t0: number; t1: number } | null {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  let bestT0 = (t0Range[0] + t0Range[1]) / 2;
  let bestT1 = (t1Range[0] + t1Range[1]) / 2;
  let bestD = Number.POSITIVE_INFINITY;

  for (const s0 of steps) {
    const t0 = t0Range[0] + (t0Range[1] - t0Range[0]) * s0;
    const p0 = evalPoint(c0, t0);
    for (const s1 of steps) {
      const t1 = t1Range[0] + (t1Range[1] - t1Range[0]) * s1;
      const p1 = evalPoint(c1, t1);
      const d = Vec2.dist(p0, p1);
      if (d < bestD) {
        bestD = d;
        bestT0 = t0;
        bestT1 = t1;
      }
    }
  }

  if (bestD <= eps * 4) return { t0: clamp01(bestT0), t1: clamp01(bestT1) };
  return null;
}

function curveBounds(curve: Curve2, t0: number, t1: number): Aabb {
  const lo = clamp01(Math.min(t0, t1));
  const hi = clamp01(Math.max(t0, t1));

  if (curve.kind === "line") {
    const p0 = evalPoint(curve, lo);
    const p1 = evalPoint(curve, hi);
    return aabbFromPoints([p0, p1]);
  }

  if (curve.kind === "arc") {
    const a0 = curve.start + curve.delta * lo;
    const a1 = curve.start + curve.delta * hi;
    const angles = arcExtremaAnglesInRange(a0, a1, curve.delta >= 0);
    const pts = angles.map((a) => ({ x: curve.c.x + curve.r * Math.cos(a), y: curve.c.y + curve.r * Math.sin(a) }));
    return aabbFromPoints(pts);
  }

  if (curve.kind === "bezier") {
    const sub = subBezier(curve.cp, lo, hi);
    return aabbFromPoints(sub);
  }

  const pts = approximateCurvePoints(curve, lo, hi);
  return aabbFromPoints(pts);
}

function approximateCurvePoints(curve: Curve2, lo: number, hi: number): Vec2[] {
  const pts: Vec2[] = [];
  pts.push(evalPoint(curve, lo));
  pts.push(evalPoint(curve, hi));
  const m = (lo + hi) / 2;
  pts.push(evalPoint(curve, m));
  const q1 = (lo + m) / 2;
  const q2 = (m + hi) / 2;
  pts.push(evalPoint(curve, q1));
  pts.push(evalPoint(curve, q2));
  return pts;
}

function arcTForPoint(arc: Arc2, p: Vec2): number | null {
  const v = Vec2.sub(p, arc.c);
  const d = Vec2.len(v);
  if (!Number.isFinite(d) || d <= EPS0) return null;
  const a = Math.atan2(v.y, v.x);
  return arcTFromAngle(arc, a);
}

function arcTFromAngle(arc: Arc2, angle: number): number | null {
  const d = arc.delta;
  if (Math.abs(d) <= EPS0) return null;
  const a0 = arc.start;
  const a = normalizeAngle(angle);
  const s = normalizeAngle(a0);
  const delta = d;

  if (Math.abs(Math.abs(delta) - Math.PI * 2) <= 1e-12) {
    const t = angleDeltaSigned(s, a, delta >= 0) / delta;
    return clamp01(t);
  }

  const diff = angleDeltaSigned(s, a, delta >= 0);
  const t = diff / delta;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  return t;
}

function arcInterval(arc: Arc2): [number, number] {
  const s = normalizeAngle(arc.start);
  const e = normalizeAngle(arc.start + arc.delta);
  const full = Math.abs(Math.abs(arc.delta) - Math.PI * 2) <= 1e-12;
  if (full) return [0, Math.PI * 2];
  const cw = arc.delta < 0;
  if (!cw) {
    const end = e >= s ? e : e + Math.PI * 2;
    return [s, end];
  }
  const end = e <= s ? e : e - Math.PI * 2;
  return [end, s];
}

function intersectAngleIntervals(i0: [number, number], i1: [number, number], eps: number): Array<[number, number]> {
  const [a0, b0] = i0[0] <= i0[1] ? i0 : [i0[1], i0[0]];
  const [a1, b1] = i1[0] <= i1[1] ? i1 : [i1[1], i1[0]];

  const xs = normalizeIntervals([[a0, b0], [a0 + Math.PI * 2, b0 + Math.PI * 2]]);
  const ys = normalizeIntervals([[a1, b1], [a1 + Math.PI * 2, b1 + Math.PI * 2]]);

  const out: Array<[number, number]> = [];
  for (const x of xs) {
    for (const y of ys) {
      const lo = Math.max(x[0], y[0]);
      const hi = Math.min(x[1], y[1]);
      if (hi < lo - eps) continue;
      out.push([lo, hi]);
    }
  }

  const merged = mergeIntervals(out, eps);
  return merged.map(([lo, hi]) => [normalizeAngle(lo), normalizeAngle(hi)]);
}

function normalizeIntervals(list: Array<[number, number]>): Array<[number, number]> {
  return list.map(([a, b]) => (a <= b ? [a, b] : [b, a]));
}

function mergeIntervals(list: Array<[number, number]>, eps: number): Array<[number, number]> {
  const sorted = list
    .filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]))
    .sort((u, v) => u[0] - v[0]);
  const out: Array<[number, number]> = [];
  for (const seg of sorted) {
    const last = out[out.length - 1];
    if (!last) out.push([seg[0], seg[1]]);
    else if (seg[0] <= last[1] + eps) last[1] = Math.max(last[1], seg[1]);
    else out.push([seg[0], seg[1]]);
  }
  return out;
}

function arcExtremaAnglesInRange(a0: number, a1: number, ccw: boolean): number[] {
  const s = normalizeAngle(a0);
  const e = normalizeAngle(a1);

  const angles = [s, e];
  const cardinals = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  for (const a of cardinals) {
    if (angleInSweep(a, s, e, ccw)) angles.push(a);
  }
  return angles;
}

function angleInSweep(angle: number, start: number, end: number, ccw: boolean): boolean {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  if (ccw) {
    if (s <= e) return a >= s - EPS0 && a <= e + EPS0;
    return a >= s - EPS0 || a <= e + EPS0;
  }
  if (e <= s) return a >= e - EPS0 && a <= s + EPS0;
  return a >= e - EPS0 || a <= s + EPS0;
}

function angleDeltaSigned(from: number, to: number, ccw: boolean): number {
  const f = normalizeAngle(from);
  const t = normalizeAngle(to);
  let d = t - f;
  if (ccw) {
    if (d < 0) d += Math.PI * 2;
    return d;
  }
  if (d > 0) d -= Math.PI * 2;
  return d;
}

function evalBezier(cp: Vec2[], t: number): Vec2 {
  const pts = cp.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      pts[i] = { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t };
    }
  }
  return pts[0]!;
}

function splitBezier(cp: Vec2[], t: number): [Vec2[], Vec2[]] {
  const n = cp.length;
  const work = cp.map((p) => ({ x: p.x, y: p.y }));
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  left.push(work[0]!);
  right.push(work[n - 1]!);
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      work[i] = {
        x: work[i]!.x + (work[i + 1]!.x - work[i]!.x) * t,
        y: work[i]!.y + (work[i + 1]!.y - work[i]!.y) * t
      };
    }
    left.push(work[0]!);
    right.push(work[n - r - 1]!);
  }
  right.reverse();
  return [left, right];
}

function subBezier(cp: Vec2[], t0: number, t1: number): Vec2[] {
  const a = clamp01(t0);
  const b = clamp01(t1);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo <= 0 && hi >= 1) return cp;
  if (hi <= EPS0) return new Array(cp.length).fill(cp[0]!).map((p) => ({ x: p.x, y: p.y }));
  const [left] = splitBezier(cp, hi);
  if (lo <= EPS0) return left;
  const u = lo / hi;
  const [, mid] = splitBezier(left, u);
  return mid;
}

function evalRBezier(cp: Vec2[], w: number[], t: number): Vec2 {
  const pts = cp.map((p, i) => ({ x: p.x * w[i]!, y: p.y * w[i]!, w: w[i]! }));
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      pts[i] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t };
    }
  }
  const out = pts[0]!;
  if (Math.abs(out.w) <= EPS0) return { x: 0, y: 0 };
  return { x: out.x / out.w, y: out.y / out.w };
}

function projectPointToSegment(p: Vec2, seg: Line2): number {
  const ab = Vec2.sub(seg.b, seg.a);
  const ap = Vec2.sub(p, seg.a);
  const den = Vec2.dot(ab, ab);
  if (den <= EPS0) return 0;
  const t = Vec2.dot(ap, ab) / den;
  return clamp01(t);
}

function swapIntersection(it: IntersectionPoint | IntersectionOverlap): IntersectionPoint | IntersectionOverlap {
  if (it.kind === "point") return { kind: "point", t0: it.t1, t1: it.t0, isSample: it.isSample };
  return { kind: "overlap", t0: it.t1, t1: it.t0, isSample: it.isSample };
}

function dedupeItems(items: Array<IntersectionPoint | IntersectionOverlap>, c0: Curve2, c1: Curve2, eps: number) {
  const out: Array<IntersectionPoint | IntersectionOverlap> = [];

  const points: IntersectionPoint[] = [];
  const overlaps: IntersectionOverlap[] = [];
  for (const it of items) {
    if (it.kind === "point") points.push(it);
    else overlaps.push(it);
  }

  const used = new Array(points.length).fill(false);
  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const pi = points[i]!;
    let best = pi;
    const ppi0 = evalPoint(c0, pi.t0);
    const ppi1 = evalPoint(c1, pi.t1);
    for (let j = i + 1; j < points.length; j++) {
      if (used[j]) continue;
      const pj = points[j]!;
      const ppj0 = evalPoint(c0, pj.t0);
      const d2 = Vec2.distSq(ppi0, ppj0);
      if (d2 <= eps * eps) {
        used[j] = true;
        if (!best.isSample && pj.isSample) best = pj;
      }
    }
    const err = Vec2.dist(ppi0, ppi1);
    if (err <= eps * 4) out.push(best);
  }

  for (const seg of overlaps) out.push(seg);
  return out.sort((a, b) => {
    const a0 = a.kind === "point" ? a.t0 : a.t0[0];
    const b0 = b.kind === "point" ? b.t0 : b.t0[0];
    return a0 - b0;
  });
}

function aabbFromPoints(pts: Vec2[]): Aabb {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function aabbIntersects(a: Aabb, b: Aabb, eps: number): boolean {
  return !(
    a.max.x < b.min.x - eps ||
    a.min.x > b.max.x + eps ||
    a.max.y < b.min.y - eps ||
    a.min.y > b.max.y + eps
  );
}

function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let x = a % twoPi;
  if (x < 0) x += twoPi;
  return x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
