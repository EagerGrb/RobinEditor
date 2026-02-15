import { Tag } from "antd";
import { type EditorTool } from "../types";
import { useEffect, useState } from "react";
import { Topics, type EventBus } from "@render/event-bus";

export type StatusBarProps = {
  bus: EventBus;
  activeTool: EditorTool["type"];
  zoom: number;
  snapEnabled: boolean;
};

export function StatusBar({ bus, activeTool, zoom, snapEnabled }: StatusBarProps) {
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    // Throttle update: only update max 30fps to avoid React render spam
    let lastTime = 0;
    const unsubscribe = bus.subscribe(Topics.INPUT_MOUSE_MOVE, (payload) => {
      const now = Date.now();
      if (now - lastTime > 32) { // ~30 FPS
        setMouse({ x: payload.x, y: payload.y });
        lastTime = now;
      }
    });
    return unsubscribe;
  }, [bus]);

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
