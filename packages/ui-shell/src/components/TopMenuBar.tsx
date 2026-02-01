import { Dropdown, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import { Topics, type EventBus } from "@render/event-bus";
import { type EditorMenuItem } from "../types";

export type TopMenuBarProps = {
  bus: EventBus;
  items: EditorMenuItem[];
};

export function TopMenuBar({ bus, items }: TopMenuBarProps) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 10
      }}
    >
      <Typography.Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
        Editor
      </Typography.Text>

      <Space size={8}>
        {items.map((item) => {
          const menuItems: MenuProps["items"] = (item.children ?? []).map((child) => ({
            key: child.key,
            label: child.label,
            onClick: () => {
              if (!child.command) return;
              bus.publish(Topics.UI_COMMAND, { command: child.command });
            }
          }));

          return (
            <Dropdown key={item.key} menu={{ items: menuItems }} trigger={["click"]}>
              <Typography.Link style={{ color: "rgba(255,255,255,0.85)" }}>
                {item.label}
              </Typography.Link>
            </Dropdown>
          );
        })}
      </Space>
    </div>
  );
}

