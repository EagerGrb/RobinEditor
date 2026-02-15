import { Button, Tooltip } from "antd";
import { Topics, type EventBus } from "@render/event-bus";
import { useEffect, useState } from "react";
import { type EditorTool } from "../types";

export type ToolPanelProps = {
  bus: EventBus;
  tools: EditorTool[];
  direction?: "vertical" | "horizontal";
};

export function ToolPanel({ bus, tools, direction = "vertical" }: ToolPanelProps) {
  const [active, setActive] = useState<EditorTool["type"]>("select");

  useEffect(() => {
    return bus.subscribe(Topics.UI_TOOL_CHANGED, (payload) => {
      setActive(payload.tool);
    });
  }, [bus]);

  return (
    <div
      style={{
        padding: 10,
        display: "flex",
        flexDirection: direction === "vertical" ? "column" : "row",
        gap: 8,
        height: direction === "vertical" ? "100%" : "auto",
        width: direction === "vertical" ? "auto" : "100%",
        overflow: "auto",
      }}
    >
      {tools.map((tool) => {
        const selected = tool.type === active;
        const text = tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label;
        return (
          <Tooltip key={tool.type} title={text} placement="right">
            <Button
              type={selected ? "primary" : "default"}
              block
              onClick={() => {
                bus.publish(Topics.UI_TOOL_CHANGED, { tool: tool.type });
              }}
            >
              {tool.label}
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
}

