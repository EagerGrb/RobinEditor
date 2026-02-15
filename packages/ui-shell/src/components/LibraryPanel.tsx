import { Input, List, Card, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useState } from "react";

export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
}

export interface LibraryPanelProps {
  items: LibraryItem[];
  onDragStart: (item: LibraryItem) => void;
}

export function LibraryPanel({ items, onDragStart }: LibraryPanelProps) {
  const [searchText, setSearchText] = useState("");

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
        <Typography.Text strong>组件库</Typography.Text>
        <Input
          placeholder="Search components..."
          prefix={<SearchOutlined />}
          style={{ marginTop: 8 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        <List
          grid={{ gutter: 8, column: 2 }}
          dataSource={filteredItems}
          renderItem={(item) => (
            <List.Item>
              <Card
                hoverable
                size="small"
                draggable
                onDragStart={() => onDragStart(item)}
                style={{ cursor: "grab" }}
                bodyStyle={{ padding: 8, textAlign: "center" }}
              >
                <div
                  style={{
                    height: 60,
                    background: "#f5f5f5",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: 10,
                  }}
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.name}
                      style={{ maxWidth: "100%", maxHeight: "100%" }}
                    />
                  ) : (
                    "No Preview"
                  )}
                </div>
                <Typography.Text ellipsis style={{ fontSize: 12 }}>
                  {item.name}
                </Typography.Text>
              </Card>
            </List.Item>
          )}
        />
      </div>
    </div>
  );
}
