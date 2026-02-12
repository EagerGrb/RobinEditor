import { useEffect, useMemo, useState } from "react";
import { Topics, type EventBus } from "@render/event-bus";
import { GraphicsKernel } from "@render/graphics-kernel";
import { GraphicsMediator } from "@render/integration-graphics";
import { RenderingMediator } from "@render/integration-rendering";
import { Canvas2DRenderer } from "@render/renderer-canvas2d";
import {
  EditorShell,
  LogPanel,
  PropertyPanel,
  StatusBar,
  ToolPanel,
  TopMenuBar,
  type EditorMenuItem,
  type EditorTool
} from "@render/ui-shell";
import { CanvasContainer } from "./CanvasContainer";

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
          { key: "view.gridToggle", label: "网格开关", command: "VIEW.GRID_TOGGLE" }
        ]
      },
      {
        key: "edit",
        label: "编辑",
        children: [
          { key: "edit.undo", label: "撤销", command: "EDIT.UNDO" },
          { key: "edit.redo", label: "重做", command: "EDIT.REDO" }
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
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas) return;

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
      renderingMediator.detach();
      graphicsMediator.detach();
      renderer.destroy();
    };
  }, [bus, canvas]);

  useEffect(() => {
    return bus.subscribe(Topics.INPUT_MOUSE_MOVE, (payload) => {
      setMouse({ x: payload.x, y: payload.y });
    });
  }, [bus]);

  useEffect(() => {
    return bus.subscribe(Topics.VIEWPORT_ZOOM_CHANGED, (payload) => {
      setZoom(payload.scale);
    });
  }, [bus]);

  useEffect(() => {
    return bus.subscribe(Topics.UI_TOOL_CHANGED, (payload) => {
      setActiveTool(payload.tool);
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
      top={<TopMenuBar bus={bus} items={menuItems} />}
      left={<ToolPanel bus={bus} tools={tools} />}
      right={<PropertyPanel bus={bus} />}
      bottom={<LogPanel bus={bus} />}
      status={
        <StatusBar
          activeTool={activeTool}
          mouse={mouse}
          zoom={zoom}
          snapEnabled={snapEnabled}
        />
      }
      canvas={<CanvasContainer bus={bus} onCanvas={setCanvas} />}
    />
  );
}
