import React from 'react';
import { Button, Space, Tooltip, Divider, theme } from 'antd';
import {
  FileAddOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  UndoOutlined,
  RedoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { Topics, type EventBus } from "@render/event-bus";

export interface TopToolbarProps {
  bus: EventBus;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({ bus }) => {
  const { token } = theme.useToken();

  const handleCommand = (command: string) => {
    bus.publish(Topics.UI_COMMAND, { command });
  };

  const tools = [
    {
      group: 'file',
      items: [
        { icon: <FileAddOutlined />, label: 'New', command: 'file:new' },
        { icon: <FolderOpenOutlined />, label: 'Open', command: 'file:open' },
        { icon: <SaveOutlined />, label: 'Save', command: 'file:save' },
      ]
    },
    {
      group: 'edit',
      items: [
        { icon: <UndoOutlined />, label: 'Undo', command: 'edit:undo' },
        { icon: <RedoOutlined />, label: 'Redo', command: 'edit:redo' },
      ]
    },
    {
      group: 'view',
      items: [
        { icon: <ZoomInOutlined />, label: 'Zoom In', command: 'view:zoom-in' },
        { icon: <ZoomOutOutlined />, label: 'Zoom Out', command: 'view:zoom-out' },
      ]
    }
  ];

  return (
    <div style={{
      padding: '4px 12px',
      borderTop: `1px solid rgba(255, 255, 255, 0.08)`,
      display: 'flex',
      alignItems: 'center',
      height: 40
    }}>
      <Space size={4}>
        {tools.map((group, groupIndex) => (
          <React.Fragment key={group.group}>
            {groupIndex > 0 && <Divider type="vertical" style={{ height: 16, margin: '0 8px', borderColor: 'rgba(255,255,255,0.2)' }} />}
            {group.items.map(item => (
              <Tooltip key={item.command} title={item.label} mouseEnterDelay={0.5}>
                <Button
                  type="text"
                  icon={item.icon}
                  onClick={() => handleCommand(item.command)}
                  size="small"
                  style={{ color: 'rgba(255,255,255,0.85)' }}
                />
              </Tooltip>
            ))}
          </React.Fragment>
        ))}
      </Space>
    </div>
  );
};
