import { Tag } from "antd";
import { type EditorTool } from "../types";

export type StatusBarProps = {
  activeTool: EditorTool["type"];
  mouse: { x: number; y: number };
  zoom: number;
  snapEnabled: boolean;
};

export function StatusBar({ activeTool, mouse, zoom, snapEnabled }: StatusBarProps) {
  const percent = zoom * 100;
  const zoomText = percent < 10 ? "<10%" : percent > 800 ? ">800%" : `${Math.round(percent)}%`;

  return (
    <div
      style={{
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 10px",
        background: "rgba(15, 17, 21, 0.85)",
        borderTop: "1px solid rgba(255,255,255,0.08)"
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Tag color="blue">工具: {activeTool}</Tag>
        <Tag color="default">
          坐标: {Math.round(mouse.x)}, {Math.round(mouse.y)}
        </Tag>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Tag color="default">缩放: {zoomText}</Tag>
        <Tag color={snapEnabled ? "green" : "default"}>吸附: {snapEnabled ? "开" : "关"}</Tag>
      </div>
    </div>
  );
}
