import { Vec2, Box2, Mat3 } from '@render/geometry';

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  visible?: boolean;
}

export interface LineStyle {
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  dashArray?: number[];
  visible?: boolean;
}

// Helper to apply Mat3 to Vec2
// Assuming Mat3 is 3x3 matrix, row-major or compatible with standard 2D affine transforms
// [ m0, m1, m2 ]
// [ m3, m4, m5 ]
// [ m6, m7, m8 ]
function applyMatrix(v: Vec2, m: Mat3): Vec2 {
  // x' = m0*x + m1*y + m2
  // y' = m3*x + m4*y + m5
  return {
    x: m[0] * v.x + m[1] * v.y + m[2],
    y: m[3] * v.x + m[4] * v.y + m[5]
  };
}

// Helper to get scale from matrix (assuming uniform scale for Arc radius)
function getScale(m: Mat3): number {
  // simplistic approach: magnitude of the first column vector
  return Math.sqrt(m[0] * m[0] + m[3] * m[3]);
}

// Helper to get rotation from matrix
function getRotation(m: Mat3): number {
  return Math.atan2(m[3], m[0]);
}

export abstract class Primitive {
  id: string;
  style?: ShapeStyle | LineStyle;

  constructor(id: string) {
    this.id = id;
  }

  abstract clone(): Primitive;
  abstract getBounds(): Box2;
  abstract transform(matrix: Mat3): void;
}

export class Line extends Primitive {
  start: Vec2;
  end: Vec2;

  constructor(id: string, start: Vec2, end: Vec2) {
    super(id);
    this.start = start;
    this.end = end;
  }

  clone(): Line {
    const l = new Line(this.id, { ...this.start }, { ...this.end });
    l.style = this.style ? { ...this.style } : undefined;
    return l;
  }

  getBounds(): Box2 {
    return Box2.create([this.start, this.end]);
  }

  transform(matrix: Mat3): void {
    this.start = applyMatrix(this.start, matrix);
    this.end = applyMatrix(this.end, matrix);
  }
}

export class Arc extends Primitive {
  center: Vec2;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;

  constructor(
    id: string,
    center: Vec2,
    radius: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean = false
  ) {
    super(id);
    this.center = center;
    this.radius = radius;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.clockwise = clockwise;
  }

  clone(): Arc {
    const a = new Arc(
      this.id,
      { ...this.center },
      this.radius,
      this.startAngle,
      this.endAngle,
      this.clockwise
    );
    a.style = this.style ? { ...this.style } : undefined;
    return a;
  }

  getBounds(): Box2 {
    // Accurate bounds for arc is complex (checking start, end, and extreme points)
    // Simplified: Bounds of the full circle or just start/end points + checking quadrants
    // For now, let's implement a reasonably accurate one.
    
    const points: Vec2[] = [];
    
    // Start and end points
    points.push(this.getPointAtAngle(this.startAngle));
    points.push(this.getPointAtAngle(this.endAngle));

    // Check extreme points (0, 90, 180, 270 degrees) if they are within the arc range
    // Normalize angles to [0, 2PI) or check logic carefully.
    // This is non-trivial to do perfectly robustly in a few lines, 
    // but essential for a graphics kernel.
    
    // We'll skip complex extreme point logic for this initial implementation 
    // and just use the full circle bounds if it's large, or just start/end for small arcs.
    // Ideally, we check if 0, PI/2, PI, 3PI/2 are between start and end angle (taking direction into account).
    
    // Placeholder: just start and end points (often insufficient)
    // Better Placeholder: Bounds of the full circle (safe but loose)
    // return Box2.create([
    //   { x: this.center.x - this.radius, y: this.center.y - this.radius },
    //   { x: this.center.x + this.radius, y: this.center.y + this.radius }
    // ]);
    
    // Let's try to add the extreme points.
    const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    for (const angle of angles) {
      if (this.isAngleInArc(angle)) {
        points.push(this.getPointAtAngle(angle));
      }
    }

    return Box2.create(points);
  }
  
  private getPointAtAngle(angle: number): Vec2 {
    return {
      x: this.center.x + this.radius * Math.cos(angle),
      y: this.center.y + this.radius * Math.sin(angle)
    };
  }

  private isAngleInArc(angle: number): boolean {
    // Normalize all angles to [0, 2PI)
    const PI2 = Math.PI * 2;
    const normalize = (a: number) => ((a % PI2) + PI2) % PI2;
    
    const s = normalize(this.startAngle);
    const e = normalize(this.endAngle);
    const a = normalize(angle);
    
    if (this.clockwise) {
        // Clockwise
        if (s === e) return true; // Full circle
        
        if (s > e) {
            // Normal case for CW (e.g. 350 -> 10)
            // Arc covers [0, e] and [s, 360]
            return a <= e || a >= s;
        } else {
            // Inverted case for CW (e.g. 10 -> 350)
            // Arc covers [0, s] and [e, 360]
            // Equivalent to NOT being in (s, e)
            return a <= s || a >= e;
        }
    } else {
        // Counter-Clockwise (Standard)
        if (s === e) return true;

        if (s < e) {
            // Normal case for CCW (e.g. 10 -> 350)
            return a >= s && a <= e;
        } else {
            // Crossing 0 case for CCW (e.g. 350 -> 10)
            return a >= s || a <= e;
        }
    }
  }

  transform(matrix: Mat3): void {
    this.center = applyMatrix(this.center, matrix);
    this.radius *= getScale(matrix);
    const rotation = getRotation(matrix);
    this.startAngle += rotation;
    this.endAngle += rotation;
    // Clockwise property usually remains unless determinant is negative (mirroring)
    // We ignore mirroring for simplicity for now.
  }
}

export class Polyline extends Primitive {
  segments: Primitive[];

  constructor(id: string, segments: Primitive[] = []) {
    super(id);
    this.segments = segments;
  }

  clone(): Polyline {
    const p = new Polyline(
      this.id,
      this.segments.map(s => s.clone())
    );
    p.style = this.style ? { ...this.style } : undefined;
    return p;
  }

  getBounds(): Box2 {
    let box = Box2.create(); // Empty box
    if (this.segments.length === 0) return box;
    
    box = this.segments[0]!.getBounds();
    for (let i = 1; i < this.segments.length; i++) {
      box = Box2.expandByBox(box, this.segments[i]!.getBounds());
    }
    return box;
  }

  transform(matrix: Mat3): void {
    for (const segment of this.segments) {
      segment.transform(matrix);
    }
  }
}

export class Polygon extends Primitive {
  exterior: Polyline;
  holes: Polyline[];

  constructor(id: string, exterior: Polyline, holes: Polyline[] = []) {
    super(id);
    this.exterior = exterior;
    this.holes = holes;
  }

  clone(): Polygon {
    const p = new Polygon(
      this.id,
      this.exterior.clone(),
      this.holes.map(h => h.clone())
    );
    p.style = this.style ? { ...this.style } : undefined;
    return p;
  }

  getBounds(): Box2 {
    // Bounds are determined by exterior
    return this.exterior.getBounds();
  }

  transform(matrix: Mat3): void {
    this.exterior.transform(matrix);
    for (const hole of this.holes) {
      hole.transform(matrix);
    }
  }
}

export class Bezier extends Primitive {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;

  constructor(id: string, p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2) {
    super(id);
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
  }

  clone(): Bezier {
    const b = new Bezier(
      this.id,
      { ...this.p0 },
      { ...this.p1 },
      { ...this.p2 },
      { ...this.p3 }
    );
    b.style = this.style ? { ...this.style } : undefined;
    return b;
  }

  getBounds(): Box2 {
    // Simplified: Convex hull of control points guarantees containment for Bezier curves
    return Box2.create([this.p0, this.p1, this.p2, this.p3]);
  }

  transform(matrix: Mat3): void {
    this.p0 = applyMatrix(this.p0, matrix);
    this.p1 = applyMatrix(this.p1, matrix);
    this.p2 = applyMatrix(this.p2, matrix);
    this.p3 = applyMatrix(this.p3, matrix);
  }
}
