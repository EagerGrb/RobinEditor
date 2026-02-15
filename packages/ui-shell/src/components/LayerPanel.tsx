import { Button, List, Typography, Space } from "antd";
import { EyeOutlined, EyeInvisibleOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";

export interface LayerModel {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
  type: "signal" | "power" | "mechanical" | "silk";
}

export interface LayerPanelProps {
  layers: LayerModel[];
  activeLayerId: string;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onSetActive: (id: string) => void;
}

export function LayerPanel({
  layers,
  activeLayerId,
  onToggleVisible,
  onToggleLock,
  onSetActive,
}: LayerPanelProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontWeight: "bold" }}>
        图层管理
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <List
          size="small"
          dataSource={layers}
          renderItem={(item) => {
            const isActive = item.id === activeLayerId;
            return (
              <List.Item
                style={{
                  cursor: "pointer",
                  backgroundColor: isActive ? "#e6f7ff" : "transparent",
                  padding: "4px 12px",
                }}
                onClick={() => onSetActive(item.id)}
              >
                <Space style={{ width: "100%" }}>
                  <Button
                    type="text"
                    size="small"
                    icon={item.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisible(item.id);
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={item.locked ? <LockOutlined /> : <UnlockOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(item.id);
                    }}
                  />
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      backgroundColor: item.color,
                      border: "1px solid #d9d9d9",
                      borderRadius: 2,
                    }}
                  />
                  <Typography.Text
                    strong={isActive}
                    style={{ flex: 1, color: isActive ? "#1890ff" : "inherit" }}
                  >
                    {item.name}
                  </Typography.Text>
                </Space>
              </List.Item>
            );
          }}
        />
      </div>
    </div>
  );
}
