import type { Point, Rect, Transform2D } from "../math/types.js";
import { identityTransform } from "../math/transform.js";
import { rectUnion } from "../math/rect.js";
import {
  computeDimensionBoundingBox,
  computeWallBoundingBox,
  type DimensionModel,
  type GridModel,
  type OpeningModel,
  type SceneModel,
  type WallModel
} from "../model/models.js";
import { createId } from "./id.js";
import { lerpPoint, segmentLength } from "../geometry/segment.js";
import { clampOpeningPosition } from "../geometry/snap.js";

export type SceneChangeSet = {
  added: string[];
  updated: string[];
  removed: string[];
  affectedBounds: Rect[];
};

type TopologyNode = {
  id: string;
  point: Point;
};

type TopologyEdge = {
  wallId: string;
  startNodeId: string;
  endNodeId: string;
};

export class SceneManager {
  private walls = new Map<string, WallModel>();
  private openings = new Map<string, OpeningModel>();
  private dimensions = new Map<string, DimensionModel>();

  private grid: GridModel = {
    id: "grid",
    type: "grid",
    transform: identityTransform(),
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata: {},
    spacing: 100,
    visible: true
  };

  private nodes = new Map<string, TopologyNode>();
  private edges = new Map<string, TopologyEdge>();

  reset(): SceneChangeSet {
    const removed = [
      ...Array.from(this.walls.keys()),
      ...Array.from(this.openings.keys()),
      ...Array.from(this.dimensions.keys())
    ];
    this.walls.clear();
    this.openings.clear();
    this.dimensions.clear();
    this.nodes.clear();
    this.edges.clear();
    return { added: [], updated: [], removed, affectedBounds: [] };
  }

  load(scene: SceneModel): SceneChangeSet {
    const removed = this.reset().removed;
    const added: string[] = [];

    this.grid = scene.grid;
    for (const w of scene.walls) {
      this.walls.set(w.id, w);
      added.push(w.id);
    }
    for (const o of scene.openings) {
      this.openings.set(o.id, o);
      added.push(o.id);
    }
    for (const d of scene.dimensions) {
      this.dimensions.set(d.id, d);
      added.push(d.id);
    }

    this.rebuildTopology();
    this.recomputeAllBounds();

    return { added, updated: [], removed, affectedBounds: [] };
  }

  save(): SceneModel {
    return {
      version: 1,
      walls: Array.from(this.walls.values()).map((w) => ({ ...w, roomIds: [...w.roomIds] })),
      openings: Array.from(this.openings.values()).map((o) => ({ ...o })),
      dimensions: Array.from(this.dimensions.values()).map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) })),
      grid: { ...this.grid }
    };
  }

  getGrid(): GridModel {
    return this.grid;
  }

  setGrid(partial: Partial<Pick<GridModel, "spacing" | "visible">>): SceneChangeSet {
    this.grid = { ...this.grid, ...partial };
    return { added: [], updated: [this.grid.id], removed: [], affectedBounds: [] };
  }

  getWall(id: string): WallModel | undefined {
    return this.walls.get(id);
  }

  getWalls(): WallModel[] {
    return Array.from(this.walls.values());
  }

  getOpenings(): OpeningModel[] {
    return Array.from(this.openings.values());
  }

  getDimensions(): DimensionModel[] {
    return Array.from(this.dimensions.values());
  }

  getAllShapes(): Array<WallModel | OpeningModel | DimensionModel | GridModel> {
    return [this.grid, ...this.getWalls(), ...this.getOpenings(), ...this.getDimensions()];
  }

  addWall(start: Point, end: Point, options?: Partial<Pick<WallModel, "thickness" | "height" | "roomIds" | "metadata">>): {
    wall: WallModel;
    changes: SceneChangeSet;
  } {
    const id = createId("wall");
    const thickness = options?.thickness ?? 200;
    const height = options?.height ?? 2800;
    const roomIds = options?.roomIds ?? [];
    const metadata = options?.metadata ?? {};
    const wall: WallModel = {
      id,
      type: "wall",
      transform: identityTransform(),
      boundingBox: computeWallBoundingBox(start, end, thickness),
      metadata,
      start,
      end,
      thickness,
      height,
      roomIds
    };

    this.walls.set(id, wall);
    this.integrateWallIntoTopology(wall, 1e-6);
    const updatedOpeningIds = this.enforceOpeningsOnWall(wall.id);
    const affectedBounds = [wall.boundingBox];

    return {
      wall,
      changes: {
        added: [wall.id],
        updated: [...updatedOpeningIds],
        removed: [],
        affectedBounds
      }
    };
  }

  updateWallEndpoints(wallId: string, start: Point, end: Point, mergeThreshold: number): SceneChangeSet {
    const wall = this.walls.get(wallId);
    if (!wall) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const beforeBounds = wall.boundingBox;

    wall.start = start;
    wall.end = end;
    wall.boundingBox = computeWallBoundingBox(wall.start, wall.end, wall.thickness);

    this.integrateWallIntoTopology(wall, mergeThreshold);
    const updatedOpeningIds = this.enforceOpeningsOnWall(wall.id);

    const afterBounds = wall.boundingBox;
    return {
      added: [],
      updated: [wallId, ...updatedOpeningIds],
      removed: [],
      affectedBounds: [rectUnion(beforeBounds, afterBounds)]
    };
  }

  updateWallEndpointsRaw(wallId: string, start: Point, end: Point): SceneChangeSet {
    const wall = this.walls.get(wallId);
    if (!wall) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const beforeBounds = wall.boundingBox;
    wall.start = { x: start.x, y: start.y };
    wall.end = { x: end.x, y: end.y };
    wall.boundingBox = computeWallBoundingBox(wall.start, wall.end, wall.thickness);

    const updatedOpeningIds = this.enforceOpeningsOnWall(wall.id);
    const afterBounds = wall.boundingBox;
    return {
      added: [],
      updated: [wallId, ...updatedOpeningIds],
      removed: [],
      affectedBounds: [rectUnion(beforeBounds, afterBounds)]
    };
  }

  updateWallProperties(
    wallId: string,
    partial: Partial<Pick<WallModel, "thickness" | "height" | "metadata" | "roomIds">>,
  ): SceneChangeSet {
    const wall = this.walls.get(wallId);
    if (!wall) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const before = wall.boundingBox;

    if (typeof partial.thickness === "number" && Number.isFinite(partial.thickness) && partial.thickness > 0) {
      wall.thickness = partial.thickness;
    }
    if (typeof partial.height === "number" && Number.isFinite(partial.height) && partial.height > 0) {
      wall.height = partial.height;
    }
    if (partial.metadata) {
      wall.metadata = { ...wall.metadata, ...partial.metadata };
    }
    if (Array.isArray(partial.roomIds)) {
      wall.roomIds = [...partial.roomIds];
    }

    wall.boundingBox = computeWallBoundingBox(wall.start, wall.end, wall.thickness);
    const updatedOpenings = this.enforceOpeningsOnWall(wallId);

    return {
      added: [],
      updated: [wallId, ...updatedOpenings],
      removed: [],
      affectedBounds: [rectUnion(before, wall.boundingBox)]
    };
  }

  addOpening(opening: Omit<OpeningModel, "id" | "type" | "transform" | "boundingBox" | "metadata"> & { metadata?: Record<string, unknown> }): {
    opening: OpeningModel;
    changes: SceneChangeSet;
  } {
    const wall = this.walls.get(opening.wallId);
    if (!wall) {
      throw new Error("Cannot add opening: wall not found");
    }

    const id = createId("opening");
    const position = clampOpeningPosition(opening.position, wall, opening.width);
    const anchor = lerpPoint(wall.start, wall.end, position);
    const bounds = computeWallBoundingBox(anchor, anchor, wall.thickness);

    const model: OpeningModel = {
      id,
      type: "opening",
      transform: identityTransform(),
      boundingBox: bounds,
      metadata: opening.metadata ?? {},
      openingKind: opening.openingKind,
      wallId: opening.wallId,
      position,
      width: opening.width,
      height: opening.height
    };
    this.openings.set(id, model);
    this.recomputeOpeningBounds(model);

    return {
      opening: model,
      changes: { added: [id], updated: [], removed: [], affectedBounds: [model.boundingBox] }
    };
  }

  updateOpeningPosition(openingId: string, position: number): SceneChangeSet {
    const opening = this.openings.get(openingId);
    if (!opening) return { added: [], updated: [], removed: [], affectedBounds: [] };
    const wall = this.walls.get(opening.wallId);
    if (!wall) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const before = opening.boundingBox;
    opening.position = clampOpeningPosition(position, wall, opening.width);
    this.recomputeOpeningBounds(opening);
    return { added: [], updated: [openingId], removed: [], affectedBounds: [rectUnion(before, opening.boundingBox)] };
  }

  updateOpeningProperties(
    openingId: string,
    partial: Partial<Pick<OpeningModel, "openingKind" | "width" | "height" | "metadata" | "wallId" | "position">>,
  ): SceneChangeSet {
    const opening = this.openings.get(openingId);
    if (!opening) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const before = opening.boundingBox;

    if (partial.openingKind === "door" || partial.openingKind === "window") {
      opening.openingKind = partial.openingKind;
    }
    if (typeof partial.width === "number" && Number.isFinite(partial.width) && partial.width > 0) {
      opening.width = partial.width;
    }
    if (typeof partial.height === "number" && Number.isFinite(partial.height) && partial.height > 0) {
      opening.height = partial.height;
    }
    if (partial.metadata) {
      opening.metadata = { ...opening.metadata, ...partial.metadata };
    }
    if (typeof partial.wallId === "string" && partial.wallId.length > 0) {
      opening.wallId = partial.wallId;
    }
    if (typeof partial.position === "number" && Number.isFinite(partial.position)) {
      opening.position = partial.position;
    }

    const wall = this.walls.get(opening.wallId);
    if (wall) {
      opening.position = clampOpeningPosition(opening.position, wall, opening.width);
      this.recomputeOpeningBounds(opening);
    }

    return {
      added: [],
      updated: [openingId],
      removed: [],
      affectedBounds: [rectUnion(before, opening.boundingBox)]
    };
  }

  addDimension(points: Point[], options?: Partial<Pick<DimensionModel, "offset" | "precision" | "metadata">>): {
    dimension: DimensionModel;
    changes: SceneChangeSet;
  } {
    if (points.length < 2) {
      throw new Error("Dimension requires at least 2 points");
    }
    const id = createId("dimension");
    const dimension: DimensionModel = {
      id,
      type: "dimension",
      transform: identityTransform(),
      boundingBox: computeDimensionBoundingBox(points),
      metadata: options?.metadata ?? {},
      points,
      offset: options?.offset ?? 200,
      precision: options?.precision ?? 0
    };
    this.dimensions.set(id, dimension);
    return { dimension, changes: { added: [id], updated: [], removed: [], affectedBounds: [dimension.boundingBox] } };
  }

  updateDimensionProperties(
    dimensionId: string,
    partial: Partial<Pick<DimensionModel, "points" | "offset" | "precision" | "metadata">>,
  ): SceneChangeSet {
    const dim = this.dimensions.get(dimensionId);
    if (!dim) return { added: [], updated: [], removed: [], affectedBounds: [] };

    const before = dim.boundingBox;

    if (Array.isArray(partial.points) && partial.points.length >= 2) {
      dim.points = partial.points.map((p) => ({ x: p.x, y: p.y }));
      dim.boundingBox = computeDimensionBoundingBox(dim.points);
    }
    if (typeof partial.offset === "number" && Number.isFinite(partial.offset)) {
      dim.offset = partial.offset;
    }
    if (typeof partial.precision === "number" && Number.isFinite(partial.precision)) {
      dim.precision = partial.precision;
    }
    if (partial.metadata) {
      dim.metadata = { ...dim.metadata, ...partial.metadata };
    }

    return {
      added: [],
      updated: [dimensionId],
      removed: [],
      affectedBounds: [rectUnion(before, dim.boundingBox)]
    };
  }

  deleteShape(id: string): SceneChangeSet {
    const affectedBounds: Rect[] = [];
    if (this.walls.has(id)) {
      const wall = this.walls.get(id)!;
      affectedBounds.push(wall.boundingBox);
      this.walls.delete(id);
      this.edges.delete(id);

      const removedOpenings: string[] = [];
      for (const o of this.openings.values()) {
        if (o.wallId === id) removedOpenings.push(o.id);
      }
      for (const oid of removedOpenings) this.openings.delete(oid);

      return { added: [], updated: [], removed: [id, ...removedOpenings], affectedBounds };
    }

    if (this.openings.has(id)) {
      const opening = this.openings.get(id)!;
      affectedBounds.push(opening.boundingBox);
      this.openings.delete(id);
      return { added: [], updated: [], removed: [id], affectedBounds };
    }

    if (this.dimensions.has(id)) {
      const dim = this.dimensions.get(id)!;
      affectedBounds.push(dim.boundingBox);
      this.dimensions.delete(id);
      return { added: [], updated: [], removed: [id], affectedBounds };
    }

    return { added: [], updated: [], removed: [], affectedBounds: [] };
  }

  getSceneBounds(): Rect | null {
    const shapes = [...this.walls.values(), ...this.openings.values(), ...this.dimensions.values()];
    if (shapes.length === 0) return null;
    let bounds = shapes[0]!.boundingBox;
    for (let i = 1; i < shapes.length; i++) {
      bounds = rectUnion(bounds, shapes[i]!.boundingBox);
    }
    return bounds;
  }

  getWorldScaleFromViewTransform(worldToScreen: Transform2D): number {
    const sx = Math.hypot(worldToScreen.a, worldToScreen.b);
    const sy = Math.hypot(worldToScreen.c, worldToScreen.d);
    return (sx + sy) / 2;
  }

  rebuildTopologyFromWalls(): void {
    this.rebuildTopology();
    this.recomputeAllBounds();
  }

  getWallEndpoints(): Array<{ point: Point; wallId: string }> {
    const endpoints: Array<{ point: Point; wallId: string }> = [];
    for (const wall of this.walls.values()) {
      endpoints.push({ point: wall.start, wallId: wall.id });
      endpoints.push({ point: wall.end, wallId: wall.id });
    }
    return endpoints;
  }

  private recomputeAllBounds(): void {
    for (const wall of this.walls.values()) {
      wall.boundingBox = computeWallBoundingBox(wall.start, wall.end, wall.thickness);
    }
    for (const opening of this.openings.values()) {
      this.recomputeOpeningBounds(opening);
    }
    for (const dim of this.dimensions.values()) {
      dim.boundingBox = computeDimensionBoundingBox(dim.points);
    }
  }

  private rebuildTopology(): void {
    this.nodes.clear();
    this.edges.clear();
    for (const wall of this.walls.values()) {
      this.integrateWallIntoTopology(wall, 1e-6);
    }
  }

  private integrateWallIntoTopology(wall: WallModel, mergeThreshold: number): void {
    const startNode = this.findOrCreateNode(wall.start, mergeThreshold);
    const endNode = this.findOrCreateNode(wall.end, mergeThreshold);

    wall.start = startNode.point;
    wall.end = endNode.point;
    wall.boundingBox = computeWallBoundingBox(wall.start, wall.end, wall.thickness);

    this.edges.set(wall.id, { wallId: wall.id, startNodeId: startNode.id, endNodeId: endNode.id });
  }

  private findOrCreateNode(point: Point, threshold: number): TopologyNode {
    let best: TopologyNode | null = null;
    let bestDist = Infinity;
    for (const node of this.nodes.values()) {
      const dx = point.x - node.point.x;
      const dy = point.y - node.point.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }

    if (best && bestDist <= threshold) {
      return best;
    }

    const id = createId("node");
    const node: TopologyNode = { id, point: { ...point } };
    this.nodes.set(id, node);
    return node;
  }

  private enforceOpeningsOnWall(wallId: string): string[] {
    const wall = this.walls.get(wallId);
    if (!wall) return [];

    const updated: string[] = [];
    const len = segmentLength(wall.start, wall.end);
    if (len <= 0) {
      for (const opening of this.openings.values()) {
        if (opening.wallId !== wallId) continue;
        opening.position = 0;
        this.recomputeOpeningBounds(opening);
        updated.push(opening.id);
      }
      return updated;
    }

    for (const opening of this.openings.values()) {
      if (opening.wallId !== wallId) continue;
      const clamped = clampOpeningPosition(opening.position, wall, opening.width);
      if (opening.position !== clamped) {
        opening.position = clamped;
        updated.push(opening.id);
      }
      this.recomputeOpeningBounds(opening);
      if (!updated.includes(opening.id)) updated.push(opening.id);
    }
    return updated;
  }

  private recomputeOpeningBounds(opening: OpeningModel): void {
    const wall = this.walls.get(opening.wallId);
    if (!wall) return;

    const anchor = lerpPoint(wall.start, wall.end, opening.position);
    opening.boundingBox = computeWallBoundingBox(anchor, anchor, wall.thickness);
  }
}
