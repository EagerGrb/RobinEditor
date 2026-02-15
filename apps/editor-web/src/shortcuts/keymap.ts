export type ShortcutContext = "GLOBAL";

export type ShortcutConfig = {
  context: ShortcutContext;
  key: string;
  command: string;
  args?: Record<string, unknown>;
};

export const shortcutRegistry: Record<ShortcutContext, ShortcutConfig[]> = {
  GLOBAL: [
    { context: "GLOBAL", key: "Mod+Z", command: "EDIT.UNDO" },
    { context: "GLOBAL", key: "Mod+Shift+Z", command: "EDIT.REDO" },
    { context: "GLOBAL", key: "Mod+Y", command: "EDIT.REDO" },
    { context: "GLOBAL", key: "Mod+C", command: "EDIT.COPY" },
    { context: "GLOBAL", key: "Mod+V", command: "EDIT.PASTE" },

    { context: "GLOBAL", key: "Mod+0", command: "VIEW.ZOOM_RESET" },

    { context: "GLOBAL", key: "V", command: "UI.TOOL", args: { tool: "select" } },
    { context: "GLOBAL", key: "W", command: "UI.TOOL", args: { tool: "track" } },
    { context: "GLOBAL", key: "A", command: "UI.TOOL", args: { tool: "arc" } },
    { context: "GLOBAL", key: "B", command: "UI.TOOL", args: { tool: "bezier" } },
    { context: "GLOBAL", key: "P", command: "UI.TOOL", args: { tool: "pad" } },
    { context: "GLOBAL", key: "I", command: "UI.TOOL", args: { tool: "via" } }
  ]
};
