import test from "node:test";
import assert from "node:assert/strict";
import { ViewGenerator } from "../src/view/ViewGenerator.js";
import type { DimensionModel, GridModel, OpeningModel, WallModel } from "../src/model/models.js";

test("ViewGenerator generates commands with rendering-core schema", () => {
  const gen = new ViewGenerator();

  const grid: GridModel = {
    id: "grid",
    type: "grid",
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata: {},
    spacing: 100,
    visible: true
  };

  const walls: WallModel[] = [
    {
      id: "w1",
      type: "wall",
      transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      boundingBox: { x: -100, y: -100, width: 300, height: 200 },
      metadata: {},
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      thickness: 200,
      height: 2800,
      roomIds: []
    }
  ];

  const openings: OpeningModel[] = [
    {
      id: "o1",
      type: "opening",
      transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      metadata: {},
      openingKind: "door",
      wallId: "w1",
      position: 0.5,
      width: 100,
      height: 2100
    }
  ];

  const dimensions: DimensionModel[] = [
    {
      id: "d1",
      type: "dimension",
      transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      metadata: {},
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 }
      ],
      offset: 200,
      precision: 0
    }
  ];

  const commands = gen.generate({
    grid,
    walls,
    openings,
    dimensions,
    selection: { selectedIds: new Set(["w1"]), hoverId: "o1", marqueeRect: { x: 10, y: 10, width: 20, height: 30 } },
    viewportWorldRect: { x: 0, y: 0, width: 250, height: 250 },
    ephemeral: []
  });

  assert.ok(commands.length > 0);

  const wallCmd = commands.find((c) => c.id === "w1");
  assert.ok(wallCmd);
  assert.equal(wallCmd.kind, "line");
  assert.equal(wallCmd.state, "selected");
  assert.equal(wallCmd.style?.strokeColor, "#ff7f0e");

  const openingCmd = commands.find((c) => c.id === "o1");
  assert.ok(openingCmd);
  assert.equal(openingCmd.kind, "line");
  assert.equal(openingCmd.state, "hover");

  const dimPoly = commands.find((c) => c.id === "d1");
  assert.ok(dimPoly);
  assert.equal(dimPoly.kind, "polyline");

  const dimText = commands.find((c) => c.id === "d1_text");
  assert.ok(dimText);
  assert.equal(dimText.kind, "text");
  assert.equal(dimText.text, "200");

  const marquee = commands.find((c) => c.id === "marquee");
  assert.ok(marquee);
  assert.equal(marquee.kind, "polyline");
});

