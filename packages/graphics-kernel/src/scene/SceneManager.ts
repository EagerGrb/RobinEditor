import type { Rect, Transform2D } from "../math/types.js";
import { rectIntersects, rectUnion } from "../math/rect.js";
import { QuadTree } from "../algorithm/QuadTree.js";
import { type EntityModel, type SceneModel } from "../model/models.js";

export type SceneChangeSet = {
  added: string[];
  updated: string[];
  removed: string[];
  affectedBounds: Rect[];
};

export class SceneManager {
  private entities = new Map<string, EntityModel>();
  private spatial = new SpatialIndex();

  reset(): SceneChangeSet {
    const removed = Array.from(this.entities.keys());
    this.entities.clear();
    this.spatial.clear();
    return { added: [], updated: [], removed, affectedBounds: [] };
  }

  load(scene: SceneModel): SceneChangeSet {
    const removed = this.reset().removed;
    const added: string[] = [];

    for (const e of scene.entities) {
      this.entities.set(e.id, e);
      this.spatial.set(e.id, e.boundingBox);
      added.push(e.id);
    }

    return { added, updated: [], removed, affectedBounds: [] };
  }

  save(): SceneModel {
    return {
      version: 1,
      entities: Array.from(this.entities.values()).map((e) => ({ ...e, metadata: { ...e.metadata } }))
    };
  }

  getEntity(id: string): EntityModel | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): EntityModel[] {
    return Array.from(this.entities.values());
  }

  addEntity(entity: EntityModel): SceneChangeSet {
    this.entities.set(entity.id, entity);
    this.spatial.set(entity.id, entity.boundingBox);
    return { added: [entity.id], updated: [], removed: [], affectedBounds: [entity.boundingBox] };
  }

  removeEntity(id: string): SceneChangeSet {
    const entity = this.entities.get(id);
    if (!entity) return { added: [], updated: [], removed: [], affectedBounds: [] };
    this.entities.delete(id);
    this.spatial.delete(id);
    return { added: [], updated: [], removed: [id], affectedBounds: [entity.boundingBox] };
  }

  updateEntity(id: string, patch: Partial<EntityModel> & { metadata?: Record<string, unknown> }): SceneChangeSet {
    const entity = this.entities.get(id);
    if (!entity) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const nextTransform = patch.transform ? { ...entity.transform, ...patch.transform } : entity.transform;
    const nextBounds = patch.boundingBox ? { ...entity.boundingBox, ...patch.boundingBox } : entity.boundingBox;
    const nextMetadata = patch.metadata ? { ...entity.metadata, ...patch.metadata } : entity.metadata;

    const next: EntityModel = {
      ...entity,
      ...patch,
      transform: nextTransform,
      boundingBox: nextBounds,
      metadata: nextMetadata
    };

    this.entities.set(id, next);
    this.spatial.set(id, next.boundingBox);

    return {
      added: [],
      updated: [id],
      removed: [],
      affectedBounds: [rectUnion(entity.boundingBox, next.boundingBox)]
    };
  }

  queryIds(rect: Rect): string[] {
    return this.spatial.query(rect);
  }
  
  getSceneBounds(): Rect | null {
    let bounds: Rect | null = null;
    for (const e of this.entities.values()) {
      bounds = bounds ? rectUnion(bounds, e.boundingBox) : e.boundingBox;
    }
    return bounds;
  }
  
  getWorldScaleFromViewTransform(t: Transform2D): number {
      return Math.hypot(t.a, t.b);
  }
}

class SpatialIndex {
  private items = new Map<string, Rect>();
  private dirty = true;
  private tree: QuadTree<string> | null = null;

  clear(): void {
    this.items.clear();
    this.dirty = true;
    this.tree = null;
  }

  set(id: string, bounds: Rect): void {
    this.items.set(id, bounds);
    this.dirty = true;
  }

  delete(id: string): void {
    if (this.items.delete(id)) this.dirty = true;
  }

  query(range: Rect): string[] {
    this.rebuildIfNeeded();
    if (!this.tree) return this.fallbackQuery(range);
    const raw = this.tree.queryRange(range);
    const out = new Set<string>();
    for (const id of raw) out.add(id);
    const hits: string[] = [];
    for (const id of out) {
      const b = this.items.get(id);
      if (b && rectIntersects(b, range)) hits.push(id);
    }
    return hits;
  }

  private fallbackQuery(range: Rect): string[] {
    const hits: string[] = [];
    for (const [id, b] of this.items) {
      if (rectIntersects(b, range)) hits.push(id);
    }
    return hits;
  }

  private rebuildIfNeeded(): void {
    if (!this.dirty) return;
    this.dirty = false;

    if (this.items.size === 0) {
      this.tree = null;
      return;
    }

    let bounds: Rect | null = null;
    for (const b of this.items.values()) {
      bounds = bounds ? rectUnion(bounds, b) : b;
    }
    if (!bounds) {
      this.tree = null;
      return;
    }

    const pad = 1;
    const rootBounds: Rect = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: Math.max(1, bounds.width + pad * 2),
      height: Math.max(1, bounds.height + pad * 2)
    };
    const tree = new QuadTree<string>(rootBounds, { capacity: 12, maxDepth: 12 });
    for (const [id, b] of this.items) tree.insert(id, b);
    this.tree = tree;
  }
}
