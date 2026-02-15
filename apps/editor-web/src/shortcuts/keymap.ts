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

    { context: "GLOBAL", key: "Mod+0", command: "VIEW.ZOOM_RESET" },

    { context: "GLOBAL", key: "V", command: "UI.TOOL", args: { tool: "select" } }
  ]
};

