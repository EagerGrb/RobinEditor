import type { Rect, Transform2D } from "../math/types.js";
import { type EntityModel, type SceneModel } from "../model/models.js";

export type SceneChangeSet = {
  added: string[];
  updated: string[];
  removed: string[];
  affectedBounds: Rect[];
};

export class SceneManager {
  private entities = new Map<string, EntityModel>();

  reset(): SceneChangeSet {
    const removed = Array.from(this.entities.keys());
    this.entities.clear();
    return { added: [], updated: [], removed, affectedBounds: [] };
  }

  load(scene: SceneModel): SceneChangeSet {
    const removed = this.reset().removed;
    const added: string[] = [];

    for (const e of scene.entities) {
      this.entities.set(e.id, e);
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
    return { added: [entity.id], updated: [], removed: [], affectedBounds: [entity.boundingBox] };
  }

  removeEntity(id: string): SceneChangeSet {
    const entity = this.entities.get(id);
    if (!entity) return { added: [], updated: [], removed: [], affectedBounds: [] };
    this.entities.delete(id);
    return { added: [], updated: [], removed: [id], affectedBounds: [entity.boundingBox] };
  }
  
  getSceneBounds(): Rect | null {
      // Simple implementation
      return null;
  }
  
  getWorldScaleFromViewTransform(t: Transform2D): number {
      return Math.hypot(t.a, t.b);
  }
}
