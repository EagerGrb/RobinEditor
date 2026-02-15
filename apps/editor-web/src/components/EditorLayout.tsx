import { useEffect, useMemo, useState } from "react";
import { Topics, type EventBus } from "@render/event-bus";
import { GraphicsKernel } from "@render/graphics-kernel";
import { GraphicsMediator } from "@render/integration-graphics";
import { RenderingMediator } from "@render/integration-rendering";
import { Canvas2DRenderer } from "@render/renderer-canvas2d";
import {
  EditorShell,
  DialogHost,
  LogPanel,
  PropertyPanel,
  StatusBar,
  ToolPanel,
  ToolToolbar,
  TopMenuBar,
  LeftPanel,
  type EditorMenuItem,
  type EditorTool,
  type LayerModel,
  type LibraryItem
} from "@render/ui-shell";
import { CanvasContainer } from "./CanvasContainer";
import { ShortcutManager } from "../shortcuts/ShortcutManager";

export type EditorLayoutProps = {
  bus: EventBus;
};

export function EditorLayout({ bus }: EditorLayoutProps) {
  const menuItems = useMemo<EditorMenuItem[]>(
    () => [
      {
        key: "file",
        label: "文件",
        children: [
          { key: "file.new", label: "新建", command: "FILE.NEW" },
          { key: "file.open", label: "打开", command: "FILE.OPEN" },
          { key: "file.save", label: "保存", command: "FILE.SAVE" }
        ]
      },
      {
        key: "view",
        label: "视图",
        children: [
          { key: "view.zoomReset", label: "缩放重置", command: "VIEW.ZOOM_RESET" },
          { key: "view.fit", label: "适配视口", command: "VIEW.FIT" },
          { key: "view.gridToggle", label: "网格开关", command: "VIEW.GRID_TOGGLE" },
          { key: "view.intersectionDemo", label: "求交演示", command: "DEBUG.INTERSECTION_DEMO" },
          { key: "view.intersectionClear", label: "清除求交演示", command: "DEBUG.INTERSECTION_CLEAR" }
        ]
      },
      {
        key: "edit",
        label: "编辑",
        children: [
          { key: "edit.undo", label: "撤销", command: "EDIT.UNDO" },
          { key: "edit.redo", label: "重做", command: "EDIT.REDO" },
          { key: "edit.copy", label: "复制", command: "EDIT.COPY" },
          { key: "edit.paste", label: "粘贴", command: "EDIT.PASTE" }
        ]
      }
    ],
    [],
  );

  const tools = useMemo<EditorTool[]>(
    () => [
      { type: "select", label: "选择", shortcut: "V" }
    ],
    [],
  );

  const [activeTool, setActiveTool] = useState<EditorTool["type"]>("select");
  // const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // Removed, handled in StatusBar
  const [zoom, setZoom] = useState<number>(1);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  // Mock Data for LeftPanel
  const [layers, setLayers] = useState<LayerModel[]>([
    { id: "L1", name: "Top Layer", visible: true, locked: false, color: "#FF0000", type: "signal" },
    { id: "L2", name: "Bottom Layer", visible: true, locked: false, color: "#0000FF", type: "signal" },
  ]);
  const [activeLayerId, setActiveLayerId] = useState("L1");
  const [libraryItems] = useState<LibraryItem[]>([
    { id: "C1", name: "Resistor 0402", thumbnail: "" },
    { id: "C2", name: "Capacitor 0603", thumbnail: "" },
  ]);

  useEffect(() => {
    if (!canvas) return;

    const shortcuts = new ShortcutManager(bus, canvas);
    shortcuts.attach();

    const kernel = new GraphicsKernel();
    const graphicsMediator = new GraphicsMediator(bus, kernel);
    graphicsMediator.attach();

    const renderer = new Canvas2DRenderer();
    renderer.init(canvas, { backgroundColor: "#111", useDirtyRects: true });

    const renderingMediator = new RenderingMediator(bus, renderer);
    renderingMediator.attach();

    const syncViewportSize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      kernel.setViewportSize({ width, height });
      renderer.resize(width, height);
      bus.publish(Topics.INPUT_CANVAS_RESIZED, { width, height, dpr });
    };

    syncViewportSize();
    requestAnimationFrame(() => syncViewportSize());

    const unsubResize = bus.subscribe(Topics.INPUT_CANVAS_RESIZED, (payload) => {
      renderer.resize(payload.width, payload.height);
    });

    return () => {
      unsubResize();
      shortcuts.detach();
      renderingMediator.detach();
      graphicsMediator.detach();
      renderer.destroy();
    };
  }, [bus, canvas]);

  // useEffect(() => {
  //   return bus.subscribe(Topics.INPUT_MOUSE_MOVE, (payload) => {
  //     setMouse({ x: payload.x, y: payload.y });
  //   });
  // }, [bus]);

  useEffect(() => {
    return bus.subscribe(Topics.VIEWPORT_ZOOM_CHANGED, (payload) => {
      setZoom(payload.scale);
    });
  }, [bus]);

  useEffect(() => {
    return bus.subscribe(Topics.UI_TOOL_CHANGED, (payload) => {
      setActiveTool(prev => prev !== payload.tool ? payload.tool : prev);
    });
  }, [bus]);

  useEffect(() => {
    return bus.subscribe(Topics.UI_COMMAND, (payload) => {
      if (payload.command === "VIEW.GRID_TOGGLE") {
        setSnapEnabled((v) => !v);
      }

      if (payload.command === "VIEW.ZOOM_RESET") {
        setZoom(1);
      }
    });
  }, [bus]);

  return (
    <EditorShell
      top={
        <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid #303030" }}>
          <div style={{ height: 44 }}>
            <TopMenuBar bus={bus} items={menuItems} />
          </div>
        </div>
      }
      left={
        <div style={{ display: "flex", flexDirection: "row", height: "100%" }}>
          <ToolToolbar bus={bus} />
          <div style={{ flex: 1, height: "100%", overflow: "hidden" }}>
            <LeftPanel
              layerProps={{
                layers,
                activeLayerId,
                onToggleVisible: (id) => {
                  setLayers((prev) =>
                    prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
                  );
                },
                onToggleLock: (id) => {
                  setLayers((prev) =>
                    prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))
                  );
                },
                onSetActive: setActiveLayerId,
              }}
              libraryProps={{
                items: libraryItems,
                onDragStart: (item) => {
                  console.log("Drag start", item);
                },
              }}
            />
          </div>
        </div>
      }
      right={<PropertyPanel bus={bus} />}
      bottom={<LogPanel bus={bus} />}
      status={
        <StatusBar
          bus={bus}
          activeTool={activeTool}
          // mouse={mouse}
          zoom={zoom}
          snapEnabled={snapEnabled}
        />
      }
      canvas={
        <>
          <CanvasContainer bus={bus} onCanvas={setCanvas} />
          <DialogHost bus={bus} />
        </>
      }
    />
  );
}
