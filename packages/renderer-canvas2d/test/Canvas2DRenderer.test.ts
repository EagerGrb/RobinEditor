import test from "node:test";
import assert from "node:assert/strict";
import { Canvas2DRenderer } from "../src/index.js";
import type { DrawCommand } from "@render/rendering-core";

class MockContext2D {
  calls: string[] = [];

  globalAlpha = 1;
  lineWidth = 1;
  lineCap: CanvasLineCap = "butt";
  lineJoin: CanvasLineJoin = "miter";
  miterLimit = 10;
  font = "12px sans-serif";
  textAlign: CanvasTextAlign = "left";
  textBaseline: CanvasTextBaseline = "alphabetic";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";

  setTransform(..._args: unknown[]): void {
    this.calls.push("setTransform");
  }

  setLineDash(_dash: number[]): void {
    this.calls.push("setLineDash");
  }

  beginPath(): void {
    this.calls.push("beginPath");
  }
  rect(): void {
    this.calls.push("rect");
  }
  clip(): void {
    this.calls.push("clip");
  }
  save(): void {
    this.calls.push("save");
  }
  restore(): void {
    this.calls.push("restore");
  }
  moveTo(): void {
    this.calls.push("moveTo");
  }
  lineTo(): void {
    this.calls.push("lineTo");
  }
  closePath(): void {
    this.calls.push("closePath");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  fill(): void {
    this.calls.push("fill");
  }
  arc(): void {
    this.calls.push("arc");
  }
  clearRect(): void {
    this.calls.push("clearRect");
  }
  fillRect(): void {
    this.calls.push("fillRect");
  }
  fillText(): void {
    this.calls.push("fillText");
  }
  translate(): void {
    this.calls.push("translate");
  }
  rotate(): void {
    this.calls.push("rotate");
  }
  drawImage(): void {
    this.calls.push("drawImage");
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * 10 } as TextMetrics;
  }
}

class MockCanvas {
  width = 0;
  height = 0;
  style: { width?: string; height?: string } = {};
  clientWidth = 300;
  clientHeight = 150;
  ctx = new MockContext2D();

  getContext(type: string): unknown {
    if (type !== "2d") return null;
    return this.ctx;
  }
}

test("init() sets DPR transform and CSS sizing", () => {
  const canvas = new MockCanvas();
  const renderer = new Canvas2DRenderer();
  renderer.init(canvas as unknown as HTMLCanvasElement, { devicePixelRatio: 2 });

  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 300);
  assert.equal(canvas.style.width, "300px");
  assert.equal(canvas.style.height, "150px");
  assert.ok(canvas.ctx.calls.includes("setTransform"));
});

test("render() draws in layer then zIndex order", () => {
  const canvas = new MockCanvas();
  const renderer = new Canvas2DRenderer();
  renderer.init(canvas as unknown as HTMLCanvasElement, { devicePixelRatio: 1 });

  const commands: DrawCommand[] = [
    {
      kind: "text",
      layer: 1,
      zIndex: 0,
      position: { x: 0, y: 0 },
      text: "top"
    },
    {
      kind: "line",
      layer: 0,
      zIndex: 5,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 }
    },
    {
      kind: "line",
      layer: 0,
      zIndex: 0,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 }
    }
  ];

  renderer.updateScene(commands);
  renderer.render();

  const drawOps = canvas.ctx.calls.filter((c) => c === "stroke" || c === "fillText");
  assert.deepEqual(drawOps, ["stroke", "stroke", "fillText"]);
});

test("dirty rect rendering clips and clears region", () => {
  const canvas = new MockCanvas();
  const renderer = new Canvas2DRenderer();
  renderer.init(canvas as unknown as HTMLCanvasElement, { devicePixelRatio: 1, useDirtyRects: true });

  const commands: DrawCommand[] = [
    {
      kind: "line",
      layer: 0,
      zIndex: 0,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      bbox: { x: 0, y: 0, width: 10, height: 1 }
    }
  ];

  renderer.updateScene({ commands, dirtyRects: [{ x: 0, y: 0, width: 20, height: 20 }], fullRedraw: false });
  renderer.render();

  assert.ok(canvas.ctx.calls.includes("clip"));
  assert.ok(canvas.ctx.calls.includes("clearRect"));
});

test("mergeOverlappingRects does not loop on overlapping rects", () => {
  const canvas = new MockCanvas();
  const renderer = new Canvas2DRenderer();
  renderer.init(canvas as unknown as HTMLCanvasElement, { devicePixelRatio: 1, useDirtyRects: true });

  const commands: DrawCommand[] = [
    {
      kind: "line",
      layer: 0,
      zIndex: 0,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      bbox: { x: 0, y: 0, width: 10, height: 1 }
    }
  ];

  renderer.updateScene({
    commands,
    dirtyRects: [
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 10, y: 10, width: 20, height: 20 }
    ],
    fullRedraw: false
  });
  renderer.render();

  assert.ok(canvas.ctx.calls.includes("clip"));
});
