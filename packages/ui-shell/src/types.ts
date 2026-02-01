export type EditorMenuItem = {
  key: string;
  label: string;
  command?: string;
  children?: EditorMenuItem[];
};

export type EditorTool = {
  type: "select" | "wall" | "opening" | "dimension";
  label: string;
  shortcut?: string;
};

export type SelectionPayload =
  | { type: "none" }
  | { type: "wall"; id: string }
  | { type: "opening"; id: string }
  | { type: "dimension"; id: string };

