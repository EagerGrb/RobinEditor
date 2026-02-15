import { Vec2 } from './vec2.js';

export interface Box2 {
  min: Vec2;
  max: Vec2;
}

export const Box2 = {
  create: (points?: Vec2[]): Box2 => {
    if (!points || points.length === 0) {
      return {
        min: { x: Infinity, y: Infinity },
        max: { x: -Infinity, y: -Infinity },
      };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    };
  },

  expand: (box: Box2, p: Vec2): Box2 => {
    return {
      min: {
        x: Math.min(box.min.x, p.x),
        y: Math.min(box.min.y, p.y),
      },
      max: {
        x: Math.max(box.max.x, p.x),
        y: Math.max(box.max.y, p.y),
      },
    };
  },
  
  expandByBox: (a: Box2, b: Box2): Box2 => {
     return {
        min: {
            x: Math.min(a.min.x, b.min.x),
            y: Math.min(a.min.y, b.min.y)
        },
        max: {
            x: Math.max(a.max.x, b.max.x),
            y: Math.max(a.max.y, b.max.y)
        }
     }
  },

  intersects: (a: Box2, b: Box2): boolean => {
    return (
      a.min.x <= b.max.x &&
      a.max.x >= b.min.x &&
      a.min.y <= b.max.y &&
      a.max.y >= b.min.y
    );
  },

  contains: (box: Box2, p: Vec2): boolean => {
    return (
      p.x >= box.min.x &&
      p.x <= box.max.x &&
      p.y >= box.min.y &&
      p.y <= box.max.y
    );
  },
  
  width: (box: Box2): number => box.max.x - box.min.x,
  height: (box: Box2): number => box.max.y - box.min.y,
  center: (box: Box2): Vec2 => ({
      x: (box.min.x + box.max.x) / 2,
      y: (box.min.y + box.max.y) / 2
  })
};
