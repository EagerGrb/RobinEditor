import type { Rect, Transform2D } from "../math/types.js";

export type EntityModel = {
  id: string;
  type: string;
  transform: Transform2D;
  boundingBox: Rect;
  metadata: Record<string, unknown>;
};

export type SceneModel = {
  version: number;
  entities: EntityModel[];
};

export type GridModel = {
  visible: boolean;
  size: number;
  subdivisions: number;
};
