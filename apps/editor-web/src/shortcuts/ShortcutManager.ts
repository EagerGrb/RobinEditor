import { Topics, type EventBus } from "@render/event-bus";
import { shortcutRegistry, type ShortcutContext, type ShortcutConfig } from "./keymap";

export class ShortcutManager {
  private context: ShortcutContext = "GLOBAL";
  private unregister: (() => void) | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly focusElement: HTMLElement,
  ) {}

  attach(): void {
    if (this.unregister) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== this.focusElement) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }

      const normalized = normalizeShortcutKey(event);
      if (!normalized) return;

      const match = this.matchShortcut(normalized);
      if (!match) return;

      event.preventDefault();
      event.stopPropagation();

      if (match.command === "UI.TOOL") {
        const tool = match.args?.["tool"];
        if (typeof tool === "string" && tool.length > 0) {
          this.bus.publish(Topics.UI_TOOL_CHANGED, { tool });
        }
        return;
      }

      this.bus.publish(Topics.UI_COMMAND, { command: match.command, params: match.args });
    };

    window.addEventListener("keydown", onKeyDown, true);
    this.unregister = () => {
      window.removeEventListener("keydown", onKeyDown, true);
      this.unregister = null;
    };
  }

  detach(): void {
    this.unregister?.();
    this.unregister = null;
  }

  setContext(context: ShortcutContext): void {
    this.context = context;
  }

  private matchShortcut(key: string): ShortcutConfig | null {
    const list = shortcutRegistry[this.context] ?? [];
    for (const item of list) {
      if (item.key === key) return item;
    }
    return null;
  }
}

function normalizeShortcutKey(event: KeyboardEvent): string | null {
  const key = event.key;
  if (!key) return null;

  const isMod = event.ctrlKey || event.metaKey;
  const parts: string[] = [];
  if (isMod) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");

  const main = normalizeMainKey(key);
  if (!main) return null;
  parts.push(main);
  return parts.join("+");
}

function normalizeMainKey(key: string): string | null {
  if (key.length === 1) return key.toUpperCase();
  if (key === "Escape") return "Escape";
  return null;
}
