import type { Vec2 } from "./vec2.js";

export type Line2 = { kind: "line"; a: Vec2; b: Vec2 };
export type Arc2 = { kind: "arc"; c: Vec2; r: number; start: number; delta: number };
export type Bezier2 = { kind: "bezier"; degree: number; cp: Vec2[] };
export type RBezier2 = { kind: "rbezier"; degree: number; cp: Vec2[]; w: number[] };

export type Curve2 = Line2 | Arc2 | Bezier2 | RBezier2;

export type IntersectionPoint = { kind: "point"; t0: number; t1: number; isSample: boolean };
export type IntersectionOverlap = {
  kind: "overlap";
  t0: [number, number];
  t1: [number, number];
  isSample: [boolean, boolean];
};

export type CurveCurveIntersections = {
  isSingularity0: boolean;
  isSingularity1: boolean;
  items: Array<IntersectionPoint | IntersectionOverlap>;
};

export type IntersectOptions = {
  distanceEpsilon: number;
  maxDepth?: number;
  maxCandidates?: number;
};
