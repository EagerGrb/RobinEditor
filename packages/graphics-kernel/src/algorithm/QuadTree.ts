import type { Rect } from "../math/types.js";
import { rectIntersects } from "../math/rect.js";

export class QuadTree<T> {
  private objects: { item: T; rect: Rect }[] = [];
  private nodes: QuadTree<T>[] = [];

  constructor(
    private bounds: Rect,
    private config: { capacity: number; maxDepth: number },
    private depth = 0
  ) {}

  insert(item: T, rect: Rect): boolean {
    if (!rectIntersects(this.bounds, rect)) return false;

    if (this.nodes.length > 0) {
      for (const node of this.nodes) node.insert(item, rect);
      return true;
    }

    this.objects.push({ item, rect });

    if (
      this.objects.length > this.config.capacity &&
      this.depth < this.config.maxDepth
    ) {
      this.subdivide();
      // Re-distribute
      for (const obj of this.objects) {
        for (const node of this.nodes) node.insert(obj.item, obj.rect);
      }
      this.objects = [];
    }
    return true;
  }

  queryRange(range: Rect): T[] {
    const results: T[] = [];
    if (!rectIntersects(this.bounds, range)) return results;

    for (const obj of this.objects) {
      if (rectIntersects(obj.rect, range)) results.push(obj.item);
    }

    for (const node of this.nodes) {
      results.push(...node.queryRange(range));
    }
    return results;
  }

  private subdivide() {
    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    const x = this.bounds.x;
    const y = this.bounds.y;

    this.nodes.push(
      new QuadTree({ x, y, width: halfW, height: halfH }, this.config, this.depth + 1),
      new QuadTree({ x: x + halfW, y, width: halfW, height: halfH }, this.config, this.depth + 1),
      new QuadTree({ x, y: y + halfH, width: halfW, height: halfH }, this.config, this.depth + 1),
      new QuadTree({ x: x + halfW, y: y + halfH, width: halfW, height: halfH }, this.config, this.depth + 1)
    );
  }
}
