export type EditorMenuItem = {
  key: string;
  label: string;
  command?: string;
  children?: EditorMenuItem[];
};

export type EditorTool = {
  type: string;
  label: string;
  shortcut?: string;
};

export type SelectionPayload =
  | { type: "none" }
  | { type: string; id: string };
