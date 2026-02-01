import { Topics, type EventBus } from "@render/event-bus";
import type { IRenderer2D } from "./contracts";

export class RenderingMediator {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly bus: EventBus,
    private readonly renderer: IRenderer2D,
  ) {}

  attach() {
    this.unsubscribes.push(
      this.bus.subscribe(Topics.GRAPHICS_RENDER_UPDATED, (payload) => {
        this.renderer.updateScene(payload);
        this.renderer.render();
        const stats = this.renderer.getStats?.();
        if (stats) {
          this.bus.publish(Topics.RENDER_STATS, stats);
        }
      }),
    );
  }

  detach() {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}
