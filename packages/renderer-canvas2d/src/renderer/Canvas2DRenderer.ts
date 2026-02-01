import type {
  DrawCommand,
  DrawCommandState,
  DrawStyle,
  IRenderer2D,
  Point,
  Rect,
  Transform2D,
  RendererDiagnostics,
  RendererOptions,
  SceneDrawData
} from "@render/rendering-core";

type ResolvedStyle = {
  strokeColor: string | null;
  fillColor: string | null;
  lineWidth: number;
  lineDash: number[];
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  opacity: number;

  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

const DEFAULT_STYLE: ResolvedStyle = {
  strokeColor: "#222",
  fillColor: null,
  lineWidth: 1,
  lineDash: [],
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  opacity: 1,

  font: "12px sans-serif",
  textAlign: "left",
  textBaseline: "alphabetic"
};

const STATE_OVERRIDES: Record<DrawCommandState, Partial<ResolvedStyle>> = {
  normal: {},
  hover: { strokeColor: "#2f80ed", lineWidth: 2 },
  selected: { strokeColor: "#eb5757", lineWidth: 2 }
};

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getDevicePixelRatio(options: RendererOptions | undefined): number {
  if (options?.devicePixelRatio != null) return Math.max(1, options.devicePixelRatio);
  const dpr =
    typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio
      : 1;
  return Math.max(1, dpr);
}

function normalizeRect(rect: Rect): Rect {
  const x1 = Math.min(rect.x, rect.x + rect.width);
  const x2 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.min(rect.y, rect.y + rect.height);
  const y2 = Math.max(rect.y, rect.y + rect.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function mergeRects(a: Rect, b: Rect): Rect {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function mergeOverlappingRects(rects: Rect[]): Rect[] {
  const normalized = rects.map(normalizeRect);
  const result: Rect[] = [];
  for (const rect of normalized) {
    let merged = rect;
    let didMerge = false;
    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      if (!existing) continue;
      if (existing === merged) continue;
      if (rectsOverlap(existing, merged)) {
        const next = mergeRects(existing, merged);
        result[i] = next;
        didMerge = true;
        merged = next;
        i = -1;
      }
    }
    if (!didMerge) result.push(merged);
  }
  return result;
}

function clampRectToViewport(rect: Rect, width: number, height: number): Rect | null {
  const x1 = Math.max(0, rect.x);
  const y1 = Math.max(0, rect.y);
  const x2 = Math.min(width, rect.x + rect.width);
  const y2 = Math.min(height, rect.y + rect.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function parseFontSizePx(font: string): number {
  const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  if (!match) return 12;
  const v = Number(match[1]);
  return Number.isFinite(v) && v > 0 ? v : 12;
}

function approxTextWidth(text: string, font: string): number {
  const fontSize = parseFontSizePx(font);
  return Math.max(0, text.length) * fontSize * 0.6;
}

function expandRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2
  };
}

function bboxFromPoints(points: Point[]): Rect {
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
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getCommandLineWidth(command: DrawCommand): number {
  const s = command.style;
  const lw = s?.lineWidth;
  return typeof lw === "number" && Number.isFinite(lw) && lw > 0 ? lw : DEFAULT_STYLE.lineWidth;
}

function commandBBox(command: DrawCommand, ctx: CanvasRenderingContext2D | null): Rect {
  if (command.bbox) return command.bbox;
  const pad = Math.max(1, getCommandLineWidth(command) * 0.5 + 2);
  switch (command.kind) {
    case "line": {
      return expandRect(bboxFromPoints([command.a, command.b]), pad);
    }
    case "polyline": {
      return expandRect(bboxFromPoints(command.points), pad);
    }
    case "polygon": {
      return expandRect(bboxFromPoints(command.points), pad);
    }
    case "arc": {
      const r = Math.max(0, command.radius);
      return expandRect(
        { x: command.center.x - r, y: command.center.y - r, width: r * 2, height: r * 2 },
        pad
      );
    }
    case "circle": {
      const r = Math.max(0, command.radius);
      return expandRect(
        { x: command.center.x - r, y: command.center.y - r, width: r * 2, height: r * 2 },
        pad
      );
    }
    case "text": {
      const font = command.style?.font ?? DEFAULT_STYLE.font;
      let w = 0;
      if (ctx) {
        const prevFont = ctx.font;
        ctx.font = font;
        try {
          w = ctx.measureText(command.text).width;
        } catch {
          w = approxTextWidth(command.text, font);
        } finally {
          ctx.font = prevFont;
        }
      } else {
        w = approxTextWidth(command.text, font);
      }
      const h = parseFontSizePx(font);
      const align = command.style?.textAlign ?? DEFAULT_STYLE.textAlign;
      const baseline = command.style?.textBaseline ?? DEFAULT_STYLE.textBaseline;

      let x = command.position.x;
      let y = command.position.y;
      if (align === "center") x -= w / 2;
      else if (align === "right" || align === "end") x -= w;

      if (baseline === "middle") y -= h / 2;
      else if (baseline === "bottom" || baseline === "ideographic") y -= h;

      return expandRect({ x, y, width: w, height: h }, 2);
    }
    case "image": {
      return expandRect(
        {
          x: command.x,
          y: command.y,
          width: command.width,
          height: command.height
        },
        2
      );
    }
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function layerOrder(layer: number | undefined): number {
  return layer ?? 0;
}

function identityTransform2D(): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function invertTransform2D(t: Transform2D): Transform2D | null {
  const det = t.a * t.d - t.b * t.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const a = t.d * invDet;
  const b = -t.b * invDet;
  const c = -t.c * invDet;
  const d = t.a * invDet;
  const e = (t.c * t.f - t.d * t.e) * invDet;
  const f = (t.b * t.e - t.a * t.f) * invDet;
  return { a, b, c, d, e, f };
}

function applyTransform2D(t: Transform2D, p: Point): Point {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}

function rectFromPoints2D(points: Point[]): Rect {
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
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function worldRectFromScreenRect(screenRect: Rect, screenToWorld: Transform2D | null): Rect | null {
  if (!screenToWorld) return null;
  const p0 = applyTransform2D(screenToWorld, { x: screenRect.x, y: screenRect.y });
  const p1 = applyTransform2D(screenToWorld, { x: screenRect.x + screenRect.width, y: screenRect.y });
  const p2 = applyTransform2D(screenToWorld, { x: screenRect.x + screenRect.width, y: screenRect.y + screenRect.height });
  const p3 = applyTransform2D(screenToWorld, { x: screenRect.x, y: screenRect.y + screenRect.height });
  return rectFromPoints2D([p0, p1, p2, p3]);
}

function resolveStyle(command: DrawCommand): ResolvedStyle {
  const state: DrawCommandState = command.state ?? "normal";
  const stateOverride = STATE_OVERRIDES[state];

  const base = DEFAULT_STYLE;
  const s: DrawStyle | undefined = command.style;
  const resolved: ResolvedStyle = {
    strokeColor: s?.strokeColor ?? stateOverride.strokeColor ?? base.strokeColor,
    fillColor: s?.fillColor ?? stateOverride.fillColor ?? base.fillColor,
    lineWidth: s?.lineWidth ?? stateOverride.lineWidth ?? base.lineWidth,
    lineDash: s?.lineDash ?? stateOverride.lineDash ?? base.lineDash,
    lineCap: s?.lineCap ?? stateOverride.lineCap ?? base.lineCap,
    lineJoin: s?.lineJoin ?? stateOverride.lineJoin ?? base.lineJoin,
    miterLimit: s?.miterLimit ?? stateOverride.miterLimit ?? base.miterLimit,
    opacity: (s?.opacity ?? base.opacity) * (command.opacity ?? 1),

    font: s?.font ?? base.font,
    textAlign: s?.textAlign ?? base.textAlign,
    textBaseline: s?.textBaseline ?? base.textBaseline
  };
  if (resolved.opacity < 0) resolved.opacity = 0;
  if (resolved.opacity > 1) resolved.opacity = 1;
  if (resolved.lineWidth <= 0 || !Number.isFinite(resolved.lineWidth)) resolved.lineWidth = 1;
  return resolved;
}

function styleKey(style: ResolvedStyle): string {
  return [
    style.strokeColor ?? "",
    style.fillColor ?? "",
    style.lineWidth,
    style.lineCap,
    style.lineJoin,
    style.miterLimit,
    style.opacity,
    style.font,
    style.textAlign,
    style.textBaseline,
    style.lineDash.join(",")
  ].join("|");
}

type SortedCommand = {
  command: DrawCommand;
  index: number;
  layer: number;
  zIndex: number;
};

export class Canvas2DRenderer implements IRenderer2D {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private options: RendererOptions = {};
  private dpr = 1;
  private width = 0;
  private height = 0;

  private viewTransform: Transform2D = identityTransform2D();

  private sceneCommands: DrawCommand[] = [];
  private sorted: SortedCommand[] = [];

  private pendingDirtyRects: Rect[] = [];
  private needsRender = false;
  private rafId: number | null = null;
  private running = false;

  private diagnostics: RendererDiagnostics = {
    lastFrameMs: 0,
    lastCommandCount: 0,
    lastDrawCalls: 0,
    lastStateChanges: 0,
    lastRenderedAt: 0
  };

  init(canvas: HTMLCanvasElement, options?: RendererOptions): void {
    this.canvas = canvas;
    this.options = options ?? {};
    this.dpr = getDevicePixelRatio(this.options);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.options.onError?.({ message: "Canvas2D context not available" });
      this.ctx = null;
      return;
    }
    this.ctx = ctx;

    const w = (canvas as unknown as { clientWidth?: number }).clientWidth ?? canvas.width;
    const h = (canvas as unknown as { clientHeight?: number }).clientHeight ?? canvas.height;
    this.resize(w, h);
  }

  updateScene(scene: DrawCommand[] | SceneDrawData): void {
    const data: SceneDrawData = Array.isArray(scene) ? { commands: scene, fullRedraw: true } : scene;

    this.sceneCommands = data.commands;
    this.sorted = this.sortCommands(this.sceneCommands);

    if (data.viewTransform) {
      this.viewTransform = data.viewTransform;
    }

    const useDirtyRects = this.options.useDirtyRects === true;
    const fullRedraw = data.fullRedraw === true || !useDirtyRects;
    if (fullRedraw) {
      this.pendingDirtyRects = [];
      this.needsRender = true;
      return;
    }

    if (data.dirtyRects && data.dirtyRects.length > 0) {
      this.pendingDirtyRects.push(...data.dirtyRects);
      this.needsRender = true;
    } else {
      this.needsRender = true;
    }
  }

  render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const start = nowMs();
    let drawCalls = 0;
    let stateChanges = 0;

    const screenToWorld = invertTransform2D(this.viewTransform);
    const dpr = this.dpr;

    const pending = this.pendingDirtyRects;
    const useDirtyRects = this.options.useDirtyRects === true;
    const dirtyRects = useDirtyRects && pending.length > 0 ? mergeOverlappingRects(pending) : [];
    this.pendingDirtyRects = [];

    if (!useDirtyRects || dirtyRects.length === 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.clearRegion(null);
      ctx.setTransform(
        dpr * this.viewTransform.a,
        dpr * this.viewTransform.b,
        dpr * this.viewTransform.c,
        dpr * this.viewTransform.d,
        dpr * this.viewTransform.e,
        dpr * this.viewTransform.f
      );
      const stats = this.drawCommands(ctx, this.sorted, null);
      drawCalls += stats.drawCalls;
      stateChanges += stats.stateChanges;
    } else {
      for (const r of dirtyRects) {
        const clipped = clampRectToViewport(r, this.width, this.height);
        if (!clipped) continue;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.rect(clipped.x, clipped.y, clipped.width, clipped.height);
        ctx.clip();
        this.clearRegion(clipped);

        ctx.setTransform(
          dpr * this.viewTransform.a,
          dpr * this.viewTransform.b,
          dpr * this.viewTransform.c,
          dpr * this.viewTransform.d,
          dpr * this.viewTransform.e,
          dpr * this.viewTransform.f
        );
        const worldClip = worldRectFromScreenRect(clipped, screenToWorld);
        const stats = this.drawCommands(ctx, this.sorted, worldClip);
        drawCalls += stats.drawCalls;
        stateChanges += stats.stateChanges;
        ctx.restore();
      }
    }

    const end = nowMs();
    this.diagnostics = {
      lastFrameMs: end - start,
      lastCommandCount: this.sorted.length,
      lastDrawCalls: drawCalls,
      lastStateChanges: stateChanges,
      lastRenderedAt: Date.now()
    };
    this.needsRender = false;
  }

  startLoop(): void {
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      if (!this.running) return;
      if (this.needsRender) this.render();
      this.rafId = this.requestFrame(loop);
    };
    this.rafId = this.requestFrame(loop);
  }

  stopLoop(): void {
    this.running = false;
    if (this.rafId != null) {
      this.cancelFrame(this.rafId);
      this.rafId = null;
    }
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.ctx) return;

    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    this.width = w;
    this.height = h;

    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const pixelW = Math.max(1, Math.floor(w * this.dpr));
    const pixelH = Math.max(1, Math.floor(h * this.dpr));
    if (this.canvas.width !== pixelW) this.canvas.width = pixelW;
    if (this.canvas.height !== pixelH) this.canvas.height = pixelH;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.needsRender = true;
  }

  destroy(): void {
    this.stopLoop();
    this.canvas = null;
    this.ctx = null;
    this.sceneCommands = [];
    this.sorted = [];
    this.pendingDirtyRects = [];
    this.needsRender = false;
  }

  getDiagnostics(): RendererDiagnostics {
    return this.diagnostics;
  }

  private requestFrame(cb: FrameRequestCallback): number {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
    return setTimeout(() => cb(nowMs()), 16) as unknown as number;
  }

  private cancelFrame(id: number): void {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(id);
      return;
    }
    clearTimeout(id as unknown as NodeJS.Timeout);
  }

  private clearRegion(region: Rect | null): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const bg = this.options.backgroundColor;
    if (!region) {
      ctx.clearRect(0, 0, this.width, this.height);
      if (bg) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();
      }
      return;
    }

    ctx.clearRect(region.x, region.y, region.width, region.height);
    if (bg) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(region.x, region.y, region.width, region.height);
      ctx.restore();
    }
  }

  private sortCommands(commands: DrawCommand[]): SortedCommand[] {
    const sortable: SortedCommand[] = commands.map((command, index) => ({
      command,
      index,
      layer: layerOrder(command.layer),
      zIndex: command.zIndex ?? 0
    }));

    sortable.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.index - b.index;
    });
    return sortable;
  }

  private drawCommands(
    ctx: CanvasRenderingContext2D,
    commands: SortedCommand[],
    clipRect: Rect | null
  ): { drawCalls: number; stateChanges: number } {
    let drawCalls = 0;
    let stateChanges = 0;
    let lastKey = "";

    for (let i = 0; i < commands.length; i++) {
      const entry = commands[i];
      if (!entry) continue;
      const command = entry.command;

      if (clipRect) {
        const bb = commandBBox(command, ctx);
        if (!intersects(bb, clipRect)) continue;
      }

      try {
        const style = resolveStyle(command);
        const key = styleKey(style);
        if (key !== lastKey) {
          this.applyStyle(ctx, style);
          stateChanges++;
          lastKey = key;
        }

        drawCalls += this.drawOne(ctx, command, style);
      } catch (cause) {
        this.options.onError?.({
          message: "DrawCommand render failed",
          commandId: command.id,
          commandIndex: i,
          cause
        });
      }
    }

    return { drawCalls, stateChanges };
  }

  private applyStyle(ctx: CanvasRenderingContext2D, style: ResolvedStyle): void {
    ctx.globalAlpha = style.opacity;
    ctx.lineWidth = style.lineWidth;
    ctx.lineCap = style.lineCap;
    ctx.lineJoin = style.lineJoin;
    ctx.miterLimit = style.miterLimit;
    ctx.setLineDash(style.lineDash);
    ctx.font = style.font;
    ctx.textAlign = style.textAlign;
    ctx.textBaseline = style.textBaseline;
    if (style.strokeColor != null) ctx.strokeStyle = style.strokeColor;
    if (style.fillColor != null) ctx.fillStyle = style.fillColor;
  }

  private drawOne(ctx: CanvasRenderingContext2D, command: DrawCommand, style: ResolvedStyle): number {
    switch (command.kind) {
      case "line": {
        if (style.strokeColor == null) return 0;
        ctx.beginPath();
        ctx.moveTo(command.a.x, command.a.y);
        ctx.lineTo(command.b.x, command.b.y);
        ctx.stroke();
        return 1;
      }
      case "polyline": {
        if (style.strokeColor == null) return 0;
        const pts = command.points;
        if (pts.length < 2) return 0;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.stroke();
        return 1;
      }
      case "polygon": {
        const pts = command.points;
        if (pts.length < 3) return 0;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.closePath();
        let calls = 0;
        if (style.fillColor != null) {
          ctx.fill();
          calls++;
        }
        if (style.strokeColor != null) {
          ctx.stroke();
          calls++;
        }
        return calls;
      }
      case "arc": {
        if (style.strokeColor == null && style.fillColor == null) return 0;
        ctx.beginPath();
        ctx.arc(
          command.center.x,
          command.center.y,
          command.radius,
          command.startAngle,
          command.endAngle,
          command.anticlockwise ?? false
        );
        let calls = 0;
        if (style.fillColor != null) {
          ctx.fill();
          calls++;
        }
        if (style.strokeColor != null) {
          ctx.stroke();
          calls++;
        }
        return calls;
      }
      case "circle": {
        if (style.strokeColor == null && style.fillColor == null) return 0;
        ctx.beginPath();
        ctx.arc(command.center.x, command.center.y, command.radius, 0, Math.PI * 2, false);
        let calls = 0;
        if (style.fillColor != null) {
          ctx.fill();
          calls++;
        }
        if (style.strokeColor != null) {
          ctx.stroke();
          calls++;
        }
        return calls;
      }
      case "text": {
        const fill = style.fillColor ?? style.strokeColor;
        if (fill == null) return 0;
        const x = command.position.x;
        const y = command.position.y;
        if (command.rotation && command.rotation !== 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(command.rotation);
          ctx.translate(-x, -y);
          ctx.fillStyle = fill;
          if (command.maxWidth != null) ctx.fillText(command.text, x, y, command.maxWidth);
          else ctx.fillText(command.text, x, y);
          ctx.restore();
          return 1;
        }
        ctx.fillStyle = fill;
        if (command.maxWidth != null) ctx.fillText(command.text, x, y, command.maxWidth);
        else ctx.fillText(command.text, x, y);
        return 1;
      }
      case "image": {
        if (command.sourceRect) {
          const s = command.sourceRect;
          ctx.drawImage(
            command.image,
            s.x,
            s.y,
            s.width,
            s.height,
            command.x,
            command.y,
            command.width,
            command.height
          );
          return 1;
        }
        ctx.drawImage(command.image, command.x, command.y, command.width, command.height);
        return 1;
      }
    }
  }
}
