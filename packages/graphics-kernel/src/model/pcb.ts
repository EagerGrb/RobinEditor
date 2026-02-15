import { Rect, Transform2D } from "../math/types";
import { EntityModel } from "./models";

// =================================================================================================
// 3. JSON Data Structures (Data Transfer Objects)
// =================================================================================================

export type UnitType = 'mm' | 'mil';

export interface PcbDocumentJSON {
  header: {
    id: string;
    title: string;
    version: string;
    createdAt: number;
    updatedAt: number;
  };
  settings: {
    unit: UnitType;
    origin: { x: number; y: number };
    grid: {
      spacing: number;
      enabled: boolean;
    };
  };
  board: BoardJSON;
}

export interface BoardJSON {
  id: string;
  outline: BoardOutlineJSON;
  layerStack: LayerStackJSON;
  nets: NetJSON[];
  netClasses: NetClassJSON[];
  footprints: FootprintJSON[];
  pads: PadJSON[];
  tracks: TrackJSON[];
  vias: ViaJSON[];
  copperAreas: CopperAreaJSON[];
  dimensions: DimensionJSON[];
  texts: TextJSON[];
}

export type LayerType = 'signal' | 'plane' | 'silk' | 'solderMask' | 'mechanical' | 'dielectric';

export interface LayerStackJSON {
  id: string;
  layers: LayerJSON[];
}

export interface LayerJSON {
  id: string;
  name: string;
  type: LayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface NetJSON {
  id: string;
  name: string;
  netClassId?: string;
}

export interface NetClassJSON {
  id: string;
  name: string;
  width: number;
  clearance: number;
  viaDrill?: number;
  viaDiameter?: number;
}

export interface PolylineJSON {
  closed: boolean;
  points: { x: number; y: number; bulge?: number }[];
}

export interface PolygonJSON {
  exterior: PolylineJSON;
  holes: PolylineJSON[];
}

export interface BoardOutlineJSON {
  id: string;
  shape: PolygonJSON;
}

export type PadShape = 'circle' | 'rect' | 'oval' | 'roundedRect';

export interface FootprintJSON {
  id: string;
  ref: string;
  name: string;
  libraryId?: string;
  position: { x: number; y: number };
  rotation: number;
  side: 'top' | 'bottom';
  locked: boolean;
  layerId: string;
  padIds: string[];
}

export interface PadJSON {
  id: string;
  parentFootprintId?: string;
  padNum?: string;
  shape: PadShape;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation: number;
  drill?: {
    diameter: number;
    offset?: { x: number; y: number };
  };
  layers: string[];
  netId?: string;
  type: 'through' | 'smt' | 'npth';
}

export interface TrackJSON {
  id: string;
  netId?: string;
  layerId: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface ViaJSON {
  id: string;
  netId?: string;
  position: { x: number; y: number };
  drill: number;
  diameter: number;
  layers: string[];
}

export interface CopperAreaJSON {
  id: string;
  netId?: string;
  layerId: string;
  shape: PolygonJSON;
  clearance: number;
  thermals: boolean;
}

export interface TextJSON {
  id: string;
  layerId: string;
  value: string;
  position: { x: number; y: number };
  rotation: number;
  fontSize: number;
}

export interface DimensionJSON {
  id: string;
  layerId: string;
  kind: 'linear' | 'horizontal' | 'vertical';
  start: { x: number; y: number };
  end: { x: number; y: number };
  offset: number;
  text?: string;
}


// =================================================================================================
// 4. Model Design (Memory Structures)
// =================================================================================================

export interface IEntity {
  id: string;
  type: string;
}

export interface IEntitySchema {
  [key: string]: any;
}

export interface IPropertyProvider {
  getSchema(): IEntitySchema;
  getProperty(key: string): any;
  setProperty(key: string, value: any): boolean;
}

/**
 * Base class for all PCB entities.
 */
export abstract class PcbBaseEntity implements IEntity, IPropertyProvider {
  constructor(public id: string, public type: string) {}

  abstract getSchema(): IEntitySchema;

  getProperty(key: string): any {
    return (this as any)[key];
  }

  setProperty(key: string, value: any): boolean {
    (this as any)[key] = value;
    return true;
  }
}

/**
 * Base class for geometric entities that can be rendered.
 * Compatible with the kernel's EntityModel.
 */
export abstract class PcbGeometricEntity extends PcbBaseEntity implements EntityModel {
  transform: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  boundingBox: Rect = { x: 0, y: 0, width: 0, height: 0 };
  metadata: Record<string, unknown> = {};

  constructor(id: string, type: string) {
    super(id, type);
  }

  protected updateTransformFromPosAndRot(pos: { x: number, y: number }, rotationDeg: number) {
    const rad = rotationDeg * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    this.transform = {
      a: c,
      b: s,
      c: -s,
      d: c,
      e: pos.x,
      f: pos.y
    };
  }
}

export class HeaderModel {
  constructor(
    public id: string,
    public title: string,
    public version: string,
    public createdAt: number,
    public updatedAt: number
  ) {}
}

export class SettingsModel {
  constructor(
    public unit: UnitType,
    public origin: { x: number; y: number },
    public grid: { spacing: number; enabled: boolean }
  ) {}
}

export class LayerModel extends PcbBaseEntity {
  constructor(
    id: string,
    public name: string,
    public layerType: LayerType,
    public order: number,
    public visible: boolean,
    public locked: boolean,
    public color: string
  ) {
    super(id, 'LAYER');
  }

  getSchema(): IEntitySchema {
    return {
      name: 'string',
      layerType: 'string',
      order: 'number',
      visible: 'boolean',
      locked: 'boolean',
      color: 'string',
    };
  }
}

export class LayerStackModel extends PcbBaseEntity {
  layers: LayerModel[] = [];

  constructor(id: string) {
    super(id, 'LAYER_STACK');
  }

  getSchema(): IEntitySchema {
    return { layers: 'array' };
  }
}

export class NetClassModel extends PcbBaseEntity {
  constructor(
    id: string,
    public name: string,
    public width: number,
    public clearance: number,
    public viaDrill?: number,
    public viaDiameter?: number
  ) {
    super(id, 'NET_CLASS');
  }

  getSchema(): IEntitySchema {
    return {
      name: 'string',
      width: 'number',
      clearance: 'number',
      viaDrill: 'number',
      viaDiameter: 'number',
    };
  }
}

export class NetModel extends PcbBaseEntity {
  constructor(
    id: string,
    public name: string,
    public netClassId?: string
  ) {
    super(id, 'NET');
  }

  getSchema(): IEntitySchema {
    return {
      name: 'string',
      netClassId: 'string',
    };
  }
}

export class BoardOutlineModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public shape: PolygonJSON
  ) {
    super(id, 'BOARD_OUTLINE');
  }

  getSchema(): IEntitySchema {
    return { shape: 'object' };
  }
}

export class FootprintModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public ref: string,
    public name: string,
    public position: { x: number; y: number },
    public rotation: number,
    public side: 'top' | 'bottom',
    public layerId: string,
    public libraryId?: string,
    public locked: boolean = false,
    public padIds: string[] = []
  ) {
    super(id, 'FOOTPRINT');
    this.updateTransform();
  }

  updateTransform() {
    this.updateTransformFromPosAndRot(this.position, this.rotation);
    // Placeholder World AABB. Ideally should be union of pads + courtyard.
    // For now, use a fixed size.
    const size = 10;
    this.boundingBox = {
      x: this.position.x - size,
      y: this.position.y - size,
      width: size * 2,
      height: size * 2
    };
  }

  getSchema(): IEntitySchema {
    return {
      ref: 'string',
      name: 'string',
      position: 'point',
      rotation: 'number',
      side: 'string',
      layerId: 'string',
    };
  }
}

export class PadModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public shape: PadShape,
    public position: { x: number; y: number },
    public size: { w: number; h: number },
    public rotation: number,
    public layers: string[],
    public padType: 'through' | 'smt' | 'npth',
    public parentFootprintId?: string,
    public padNum?: string,
    public drill?: { diameter: number; offset?: { x: number; y: number } },
    public netId?: string
  ) {
    super(id, 'PAD');
    this.updateTransform();
  }

  updateTransform() {
    this.updateTransformFromPosAndRot(this.position, this.rotation);
    // BoundingBox must be World Space AABB for the SpatialIndex to work correctly
    // We approximate it by taking the position and inflating by size (ignoring rotation for AABB for now, or we can be more precise)
    // Since we are axis-aligned for now or simple shapes:
    const halfW = this.size.w / 2;
    const halfH = this.size.h / 2;
    // If rotation is 0, this is exact. If rotated, this might be too small, but let's assume 0 for now or compute bounding box of rotated rect.
    // For simplicity and to ensure visibility, let's use the max dimension for radius.
    const radius = Math.hypot(halfW, halfH);
    
    this.boundingBox = {
      x: this.position.x - radius,
      y: this.position.y - radius,
      width: radius * 2,
      height: radius * 2
    };
  }

  getSchema(): IEntitySchema {
    return {
      shape: 'string',
      position: 'point',
      size: 'size',
      rotation: 'number',
      layers: 'array',
      padType: 'string',
      padNum: 'string',
      netId: 'string',
    };
  }
}

export class TrackModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public layerId: string,
    public width: number,
    public points: { x: number; y: number }[],
    public netId?: string
  ) {
    super(id, 'TRACK');
    this.updateTransform();
  }

  updateTransform() {
    if (this.points.length === 0) {
      this.boundingBox = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const halfWidth = this.width / 2;
    this.boundingBox = {
      x: minX - halfWidth,
      y: minY - halfWidth,
      width: (maxX - minX) + this.width,
      height: (maxY - minY) + this.width
    };
  }

  getSchema(): IEntitySchema {
    return {
      layerId: 'string',
      width: 'number',
      points: 'array',
      netId: 'string',
    };
  }
}

export class ArcTrackModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public layerId: string,
    public width: number,
    public center: { x: number; y: number },
    public radius: number,
    public startAngle: number,
    public endAngle: number,
    public clockwise: boolean = false,
    public netId?: string
  ) {
    super(id, 'ARC_TRACK');
    this.updateTransform();
  }

  updateTransform() {
    this.transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this.boundingBox = arcBounds(this.center, this.radius, this.startAngle, this.endAngle, this.clockwise, this.width);
  }

  getSchema(): IEntitySchema {
    return {
      layerId: 'string',
      width: 'number',
      center: 'point',
      radius: 'number',
      startAngle: 'number',
      endAngle: 'number',
      clockwise: 'boolean',
      netId: 'string',
    };
  }
}

export class BezierTrackModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public layerId: string,
    public width: number,
    public p0: { x: number; y: number },
    public p1: { x: number; y: number },
    public p2: { x: number; y: number },
    public p3: { x: number; y: number },
    public netId?: string
  ) {
    super(id, 'BEZIER_TRACK');
    this.updateTransform();
  }

  updateTransform() {
    this.transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this.boundingBox = bezierBounds([this.p0, this.p1, this.p2, this.p3], this.width);
  }

  getSchema(): IEntitySchema {
    return {
      layerId: 'string',
      width: 'number',
      p0: 'point',
      p1: 'point',
      p2: 'point',
      p3: 'point',
      netId: 'string',
    };
  }
}

export class ViaModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public position: { x: number; y: number },
    public drill: number,
    public diameter: number,
    public layers: string[],
    public netId?: string
  ) {
    super(id, 'VIA');
    this.updateTransform();
  }

  updateTransform() {
    this.updateTransformFromPosAndRot(this.position, 0);
    // World Space AABB
    const r = this.diameter / 2;
    this.boundingBox = {
      x: this.position.x - r,
      y: this.position.y - r,
      width: this.diameter,
      height: this.diameter
    };
  }

  getSchema(): IEntitySchema {
    return {
      position: 'point',
      drill: 'number',
      diameter: 'number',
      layers: 'array',
      netId: 'string',
    };
  }
}

function arcBounds(
  center: { x: number; y: number },
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  width: number
): Rect {
  const r = Math.max(0, radius);
  const pad = 0;
  const points: { x: number; y: number }[] = [];

  const pushPoint = (angle: number) => {
    points.push({ x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
  };

  pushPoint(startAngle);
  pushPoint(endAngle);

  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (const a of angles) {
    if (isAngleInArc(a, startAngle, endAngle, clockwise)) pushPoint(a);
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return { x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 };
}

function isAngleInArc(angle: number, startAngle: number, endAngle: number, clockwise: boolean): boolean {
  const ccw = clockwise;
  const delta = angleDeltaSigned(startAngle, endAngle, ccw);
  const diff = angleDeltaSigned(startAngle, angle, ccw);
  const eps = 1e-12;
  if (!Number.isFinite(delta) || Math.abs(delta) <= eps) return false;
  if (delta > 0) return diff >= -eps && diff <= delta + eps;
  return diff <= eps && diff >= delta - eps;
}

function bezierBounds(points: Array<{ x: number; y: number }>, width: number): Rect {
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];
  if (!p0 || !p1 || !p2 || !p3) return { x: 0, y: 0, width: 0, height: 0 };

  const ts = new Set<number>();
  ts.add(0);
  ts.add(1);
  for (const t of cubicBezierExtremaTs(p0.x, p1.x, p2.x, p3.x)) ts.add(t);
  for (const t of cubicBezierExtremaTs(p0.y, p1.y, p2.y, p3.y)) ts.add(t);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const t of ts) {
    const p = cubicBezierPoint(p0, p1, p2, p3, t);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function isAngleBetweenCCW(angle: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return angle >= start && angle <= end;
  return angle >= start || angle <= end;
}

function angleDeltaSigned(from: number, to: number, ccw: boolean): number {
  const PI2 = Math.PI * 2;
  const normalize = (v: number) => ((v % PI2) + PI2) % PI2;
  const f = normalize(from);
  const t = normalize(to);
  let d = t - f;
  if (ccw) {
    if (d < 0) d += PI2;
    return d;
  }
  if (d > 0) d -= PI2;
  return d;
}

function cubicBezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}

function cubicBezierExtremaTs(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 3 * p0 - 6 * p1 + 3 * p2;
  const c = -3 * p0 + 3 * p1;

  const A = 3 * a;
  const B = 2 * b;
  const C = c;
  const eps = 1e-12;
  const out: number[] = [];

  if (Math.abs(A) < eps) {
    if (Math.abs(B) < eps) return out;
    const t = -C / B;
    if (t > 0 && t < 1) out.push(t);
    return out;
  }

  const disc = B * B - 4 * A * C;
  if (disc < 0) return out;
  const s = Math.sqrt(disc);
  const t1 = (-B + s) / (2 * A);
  const t2 = (-B - s) / (2 * A);
  if (t1 > 0 && t1 < 1) out.push(t1);
  if (t2 > 0 && t2 < 1) out.push(t2);
  return out;
}

export class CopperAreaModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public layerId: string,
    public shape: PolygonJSON,
    public clearance: number,
    public thermals: boolean,
    public netId?: string
  ) {
    super(id, 'COPPER_AREA');
  }

  getSchema(): IEntitySchema {
    return {
      layerId: 'string',
      shape: 'object',
      clearance: 'number',
      thermals: 'boolean',
      netId: 'string',
    };
  }
}

export class TextModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public layerId: string,
    public value: string,
    public position: { x: number; y: number },
    public rotation: number,
    public fontSize: number
  ) {
    super(id, 'TEXT');
    this.updateTransform();
  }

  updateTransform() {
    this.updateTransformFromPosAndRot(this.position, this.rotation);
  }

  getSchema(): IEntitySchema {
    return {
      layerId: 'string',
      value: 'string',
      position: 'point',
      rotation: 'number',
      fontSize: 'number',
    };
  }
}

export class DimensionModel extends PcbGeometricEntity {
  constructor(
    id: string,
    public layerId: string,
    public kind: 'linear' | 'horizontal' | 'vertical',
    public start: { x: number; y: number },
    public end: { x: number; y: number },
    public offset: number,
    public text?: string
  ) {
    super(id, 'DIMENSION');
  }

  getSchema(): IEntitySchema {
    return {
      layerId: 'string',
      kind: 'string',
      start: 'point',
      end: 'point',
      offset: 'number',
      text: 'string',
    };
  }
}

export class BoardModel {
  outline?: BoardOutlineModel;
  layerStack: LayerStackModel;
  nets: Map<string, NetModel> = new Map();
  netClasses: Map<string, NetClassModel> = new Map();
  footprints: Map<string, FootprintModel> = new Map();
  pads: Map<string, PadModel> = new Map();
  tracks: Map<string, TrackModel> = new Map();
  vias: Map<string, ViaModel> = new Map();
  copperAreas: Map<string, CopperAreaModel> = new Map();
  dimensions: Map<string, DimensionModel> = new Map();
  texts: Map<string, TextModel> = new Map();

  constructor(public id: string) {
    this.layerStack = new LayerStackModel(id + '_stack');
  }
}

export class PcbDocumentModel {
  header: HeaderModel;
  settings: SettingsModel;
  board: BoardModel;

  constructor(header: HeaderModel, settings: SettingsModel, board: BoardModel) {
    this.header = header;
    this.settings = settings;
    this.board = board;
  }
}
