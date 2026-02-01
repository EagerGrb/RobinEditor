import { Button, Tooltip } from "antd";
import { Topics, type EventBus } from "@render/event-bus";
import { useEffect, useState } from "react";
import { type EditorTool } from "../types";

export type ToolPanelProps = {
  bus: EventBus;
  tools: EditorTool[];
};

export function ToolPanel({ bus, tools }: ToolPanelProps) {
  const [active, setActive] = useState<EditorTool["type"]>("select");

  useEffect(() => {
    return bus.subscribe(Topics.UI_TOOL_CHANGED, (payload) => {
      setActive(payload.tool);
    });
  }, [bus]);

  return (
    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
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

