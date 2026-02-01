import type { InputKeyEvent, InputPointerEvent, Tool, ToolContext, ToolEventResult } from "./Tool.js";
import { handledStop, unhandled } from "./Tool.js";

export type OpeningPlacementOptions = {
  kind: "door" | "window";
  width: number;
  height: number;
};

export class OpeningPlacementTool implements Tool {
  readonly type = "openingPlacement" as const;

  private options: OpeningPlacementOptions;
  private hoverWallId: string | null = null;
  private hoverT: number | null = null;

  constructor(options: OpeningPlacementOptions) {
    this.options = options;
  }

  onEnter(): void {
    this.hoverWallId = null;
    this.hoverT = null;
  }

  onExit(): void {
    this.hoverWallId = null;
    this.hoverT = null;
  }

  onPointerEvent(event: InputPointerEvent, ctx: ToolContext): ToolEventResult {
    if (event.type === "pointermove") {
      const snap = ctx.snapPoint(event.worldPosition, {
        enableGrid: false,
        enableEndpoints: false,
        enableWalls: true,
        thresholdPx: 12
      });
      if (snap.candidate?.kind === "wall" && snap.candidate.wallId && typeof snap.candidate.t === "number") {
        this.hoverWallId = snap.candidate.wallId;
        this.hoverT = snap.candidate.t;
      } else {
        this.hoverWallId = null;
        this.hoverT = null;
      }
      return handledStop();
    }

    if (event.type === "pointerdown" && (event.buttons & 1) === 1) {
      if (this.hoverWallId && this.hoverT != null) {
        ctx.addOpeningAt(this.hoverWallId, this.hoverT, this.options.kind, {
          width: this.options.width,
          height: this.options.height
        });
        return handledStop();
      }
      return handledStop();
    }

    return unhandled();
  }

  onKeyDown(event: InputKeyEvent): ToolEventResult {
    if (event.key === "Escape") {
      return handledStop();
    }
    return unhandled();
  }
}
