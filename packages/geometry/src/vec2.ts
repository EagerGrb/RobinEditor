export interface Vec2 {
  x: number;
  y: number;
}

export const Vec2 = {
  create: (x: number = 0, y: number = 0): Vec2 => ({ x, y }),
  
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  
  mul: (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s }),
  
  div: (v: Vec2, s: number): Vec2 => ({ x: v.x / s, y: v.y / s }),

  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  
  cross: (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x, // 2D Cross Product (Scalar)
  
  len: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  
  lenSq: (v: Vec2): number => v.x * v.x + v.y * v.y,

  dist: (a: Vec2, b: Vec2): number => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)),
  
  distSq: (a: Vec2, b: Vec2): number => Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2),

  normalize: (v: Vec2): Vec2 => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
  },
  
  rotate: (v: Vec2, angle: number): Vec2 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  },
  
  equals: (a: Vec2, b: Vec2, epsilon: number = 0): boolean => {
    if (epsilon === 0) return a.x === b.x && a.y === b.y;
    return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
  },
  
  clone: (v: Vec2): Vec2 => ({ x: v.x, y: v.y }),
};

// Matrix3 (2D Transform: 3x3 Matrix)
// 用于 Viewport 变换和局部坐标变换
export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

export const Mat3 = {
  identity: (): Mat3 => [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ],
};
