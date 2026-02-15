import React, { useEffect, useState } from 'react';
import { Button, Tooltip, Space, theme } from 'antd';
import {
  SelectOutlined,
  LineOutlined,
  BorderOutlined,
  GatewayOutlined,
  NodeIndexOutlined,
  DeploymentUnitOutlined,
  CopyOutlined,
  SnippetsOutlined
} from '@ant-design/icons';
import { Topics, type EventBus } from "@render/event-bus";

export interface ToolToolbarProps {
  bus: EventBus;
}

type ToolType = 'select' | 'track' | 'arc' | 'bezier' | 'pad' | 'via' | 'delete';

interface ToolDef {
  type: ToolType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

const TOOLS: ToolDef[] = [
  { type: 'select', label: 'Select', icon: <SelectOutlined />, shortcut: 'V' },
  { type: 'track', label: 'Track', icon: <LineOutlined />, shortcut: 'W' },
  { type: 'arc', label: 'Arc', icon: <NodeIndexOutlined />, shortcut: 'A' },
  { type: 'bezier', label: 'Bezier', icon: <DeploymentUnitOutlined />, shortcut: 'B' },
  { type: 'pad', label: 'Pad', icon: <BorderOutlined />, shortcut: 'P' },
  { type: 'via', label: 'Via', icon: <GatewayOutlined />, shortcut: 'I' },
];

export const ToolToolbar: React.FC<ToolToolbarProps> = ({ bus }) => {
  const { token } = theme.useToken();
  const [activeTool, setActiveTool] = useState<string>('select');

  useEffect(() => {
    // Subscribe to tool changes
    const unsubscribe = bus.subscribe(Topics.UI_TOOL_CHANGED, (payload: { tool: string }) => {
      // Prevent redundant state updates
      setActiveTool(prev => prev !== payload.tool ? payload.tool : prev);
    });

    return () => {
      unsubscribe();
    };
  }, [bus]);

  const handleToolClick = (tool: ToolDef) => {
    bus.publish(Topics.UI_TOOL_CHANGED, { tool: tool.type });
  };

  return (
    <div style={{
      width: 40,
      borderRight: `1px solid rgba(255, 255, 255, 0.08)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 0',
      height: '100%',
      backgroundColor: token.colorBgContainer // Optional: match container bg
    }}>
      <Space direction="vertical" size={8}>
        {TOOLS.map((tool) => (
          <Tooltip key={tool.type} title={`${tool.label} ${tool.shortcut ? `(${tool.shortcut})` : ''}`} placement="right">
            <Button
              type={activeTool === tool.type ? 'primary' : 'text'}
              icon={tool.icon}
              onClick={() => handleToolClick(tool)}
              style={{
                color: activeTool === tool.type ? undefined : 'rgba(255,255,255,0.85)'
              }}
            />
          </Tooltip>
        ))}

        <div style={{ height: 1, width: 24, background: "rgba(255,255,255,0.12)", margin: "6px auto" }} />

        <Tooltip title="复制 (Mod+C)" placement="right">
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={() => bus.publish(Topics.UI_COMMAND, { command: "EDIT.COPY" })}
            style={{ color: "rgba(255,255,255,0.85)" }}
          />
        </Tooltip>

        <Tooltip title="粘贴 (Mod+V)" placement="right">
          <Button
            type="text"
            icon={<SnippetsOutlined />}
            onClick={() => bus.publish(Topics.UI_COMMAND, { command: "EDIT.PASTE" })}
            style={{ color: "rgba(255,255,255,0.85)" }}
          />
        </Tooltip>
      </Space>
    </div>
  );
};
