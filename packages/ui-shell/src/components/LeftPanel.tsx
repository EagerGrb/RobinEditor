import { Tabs } from "antd";
import { LayerPanel, LayerPanelProps } from "./LayerPanel";
import { LibraryPanel, LibraryPanelProps } from "./LibraryPanel";

export interface LeftPanelProps {
  layerProps: LayerPanelProps;
  libraryProps: LibraryPanelProps;
}

export function LeftPanel({ layerProps, libraryProps }: LeftPanelProps) {
  const items = [
    {
      key: "layers",
      label: "图层",
      children: <LayerPanel {...layerProps} />,
    },
    {
      key: "library",
      label: "库",
      children: <LibraryPanel {...libraryProps} />,
    },
  ];

  return (
    <div style={{ height: "100%", borderRight: "1px solid #303030" }}>
      <Tabs
        defaultActiveKey="layers"
        items={items}
        size="small"
        tabBarStyle={{ margin: 0, padding: "0 8px" }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
