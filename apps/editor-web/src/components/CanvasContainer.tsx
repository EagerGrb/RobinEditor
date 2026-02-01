import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { Topics, type EventBus } from "@render/event-bus";

export type CanvasContainerProps = {
  bus: EventBus;
  onCanvas?: (canvas: HTMLCanvasElement) => void;
};

export function CanvasContainer({ bus, onCanvas }: CanvasContainerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectionBoundsWorld, setSelectionBoundsWorld] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);
  const [viewport, setViewport] = useState<{ scale: number; offsetX: number; offsetY: number }>(
    () => ({ scale: 1, offsetX: 0, offsetY: 0 }),
  );

  const transformDragRef = useRef<{
    active: boolean;
    handleType: "move" | "rotate" | "scale-nw" | "scale-ne" | "scale-se" | "scale-sw";
  } | null>(null);

  const getScreenPointFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const normalizedModifiers = useMemo(() => {
    return (event: MouseEvent | WheelEvent | KeyboardEvent) => ({
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    });
  }, []);

  useEffect(() => {
    const unsubSelection = bus.subscribe(Topics.GRAPHICS_SELECTION_SET_CHANGED, (payload) => {
      setSelectionBoundsWorld(payload.bounds);
    });
    const unsubViewport = bus.subscribe(Topics.VIEWPORT_PAN_CHANGED, (payload) => {
      setViewport({ scale: payload.scale, offsetX: payload.offsetX, offsetY: payload.offsetY });
    });
    return () => {
      unsubSelection();
      unsubViewport();
    };
  }, [bus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    onCanvas?.(canvas);

    const getScreenPoint = (event: MouseEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };

    const boxThreshold = 4;
    let leftDown = false;
    let leftDownStart: { x: number; y: number } | null = null;
    let boxActive = false;

    let panActive = false;
    let lastPanPoint: { x: number; y: number } | null = null;

    const onMouseDown = (event: MouseEvent) => {
      if (transformDragRef.current?.active) return;
      canvas.focus();

      if (event.button === 0) {
        leftDown = true;
        leftDownStart = getScreenPoint(event);
        boxActive = false;
      }

      if (event.button === 2) {
        panActive = true;
        lastPanPoint = getScreenPoint(event);
        bus.publish(Topics.INPUT_VIEWPORT_PAN_START, {
          x: lastPanPoint.x,
          y: lastPanPoint.y,
          timestamp: event.timeStamp
        });
      }

      bus.publish(Topics.INPUT_MOUSE_DOWN, {
        ...getScreenPoint(event),
        buttons: event.buttons,
        button: event.button,
        pointerId: 1,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    const onMouseMove = (event: MouseEvent) => {
      const point = getScreenPoint(event);

      if (transformDragRef.current?.active) {
        bus.publish(Topics.INPUT_TRANSFORM_HANDLE_DRAG, {
          handleType: transformDragRef.current.handleType,
          x: point.x,
          y: point.y,
          modifiers: normalizedModifiers(event),
          timestamp: event.timeStamp
        });
        return;
      }

      if (panActive && lastPanPoint) {
        const deltaX = point.x - lastPanPoint.x;
        const deltaY = point.y - lastPanPoint.y;
        lastPanPoint = point;
        bus.publish(Topics.INPUT_VIEWPORT_PAN_MOVE, {
          deltaX,
          deltaY,
          timestamp: event.timeStamp
        });
      }

      if (leftDown && leftDownStart) {
        const dx = point.x - leftDownStart.x;
        const dy = point.y - leftDownStart.y;
        const dist = Math.hypot(dx, dy);

        if (!boxActive && dist >= boxThreshold) {
          boxActive = true;
          bus.publish(Topics.INPUT_BOX_SELECTION_START, {
            x: leftDownStart.x,
            y: leftDownStart.y,
            modifiers: normalizedModifiers(event),
            timestamp: event.timeStamp
          });
        }

        if (boxActive) {
          bus.publish(Topics.INPUT_BOX_SELECTION_CHANGE, {
            x: point.x,
            y: point.y,
            modifiers: normalizedModifiers(event),
            timestamp: event.timeStamp
          });
        }
      }

      bus.publish(Topics.INPUT_MOUSE_MOVE, {
        ...point,
        buttons: event.buttons,
        pointerId: 1,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    const onMouseUp = (event: MouseEvent) => {
      const point = getScreenPoint(event);

      if (transformDragRef.current?.active) {
        const handleType = transformDragRef.current.handleType;
        transformDragRef.current = null;
        leftDown = false;
        leftDownStart = null;
        boxActive = false;
        bus.publish(Topics.INPUT_TRANSFORM_HANDLE_END, {
          handleType,
          timestamp: event.timeStamp
        });
        return;
      }

      if (boxActive && leftDownStart) {
        bus.publish(Topics.INPUT_BOX_SELECTION_END, {
          x0: leftDownStart.x,
          y0: leftDownStart.y,
          x1: point.x,
          y1: point.y,
          modifiers: normalizedModifiers(event),
          timestamp: event.timeStamp
        });
      }

      leftDown = false;
      leftDownStart = null;
      boxActive = false;

      if (panActive) {
        panActive = false;
        lastPanPoint = null;
        bus.publish(Topics.INPUT_VIEWPORT_PAN_END, {
          timestamp: event.timeStamp
        });
      }

      bus.publish(Topics.INPUT_MOUSE_UP, {
        ...point,
        buttons: event.buttons,
        button: event.button,
        pointerId: 1,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    const onDoubleClick = (event: MouseEvent) => {
      bus.publish(Topics.INPUT_DOUBLE_CLICK, {
        ...getScreenPoint(event),
        buttons: event.buttons,
        pointerId: 1,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    const onWheel = (event: WheelEvent) => {
      const modifiers = normalizedModifiers(event);
      const shouldZoom = modifiers.ctrlKey || modifiers.metaKey;
      if (shouldZoom) {
        event.preventDefault();
        bus.publish(Topics.INPUT_VIEWPORT_ZOOM, {
          ...getScreenPoint(event),
          deltaY: event.deltaY,
          modifiers,
          timestamp: event.timeStamp
        });
      }
      bus.publish(Topics.INPUT_WHEEL, {
        ...getScreenPoint(event),
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        modifiers,
        timestamp: event.timeStamp
      });
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      bus.publish(Topics.INPUT_CONTEXT_MENU, {
        ...getScreenPoint(event),
        buttons: event.buttons,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== canvas) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }

      const isMod = event.ctrlKey || event.metaKey;
      const keyLower = event.key.toLowerCase();

      if (isMod && !event.shiftKey && keyLower === "z") {
        event.preventDefault();
        bus.publish(Topics.UI_COMMAND, { command: "EDIT.UNDO" });
        return;
      }

      if (isMod && ((event.shiftKey && keyLower === "z") || keyLower === "y")) {
        event.preventDefault();
        bus.publish(Topics.UI_COMMAND, { command: "EDIT.REDO" });
        return;
      }

      if (isMod && keyLower === "0") {
        event.preventDefault();
        bus.publish(Topics.UI_COMMAND, { command: "VIEW.ZOOM_RESET" });
        return;
      }

      if (!isMod && !event.repeat) {
        if (keyLower === "v") bus.publish(Topics.UI_TOOL_CHANGED, { tool: "select" });
        else if (keyLower === "w") bus.publish(Topics.UI_TOOL_CHANGED, { tool: "wall" });
        else if (keyLower === "o") bus.publish(Topics.UI_TOOL_CHANGED, { tool: "opening" });
        else if (keyLower === "d") bus.publish(Topics.UI_TOOL_CHANGED, { tool: "dimension" });
      }

      if ((event.key === "Backspace" || event.key === "Delete") && event.repeat) {
        event.preventDefault();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
      }
      bus.publish(Topics.INPUT_KEY_DOWN, {
        key: event.key,
        code: event.code,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (document.activeElement !== canvas) return;
      bus.publish(Topics.INPUT_KEY_UP, {
        key: event.key,
        code: event.code,
        modifiers: normalizedModifiers(event),
        timestamp: event.timeStamp
      });
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [bus, normalizedModifiers, onCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const publishSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      bus.publish(Topics.INPUT_CANVAS_RESIZED, {
        width: rect.width,
        height: rect.height,
        dpr
      });
    };

    const observer = new ResizeObserver(() => {
      publishSize();
    });

    observer.observe(container);
    publishSize();
    requestAnimationFrame(() => publishSize());
    return () => observer.disconnect();
  }, [bus]);

  const selectionBoundsScreen = selectionBoundsWorld
    ? {
        x: viewport.scale * selectionBoundsWorld.x + viewport.offsetX,
        y: viewport.scale * selectionBoundsWorld.y + viewport.offsetY,
        width: viewport.scale * selectionBoundsWorld.width,
        height: viewport.scale * selectionBoundsWorld.height
      }
    : null;

  const handleSize = 10;
  const rotateHandleOffset = 24;

  const handleStyleBase: CSSProperties = {
    position: "absolute",
    width: handleSize,
    height: handleSize,
    background: "#fff",
    border: "1px solid rgba(255, 127, 14, 0.95)",
    boxSizing: "border-box",
    pointerEvents: "auto"
  };

  const onHandleMouseDown = (
    handleType: "move" | "rotate" | "scale-nw" | "scale-ne" | "scale-se" | "scale-sw",
  ) => {
    return (event: ReactMouseEvent<HTMLDivElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = getScreenPointFromClient(event.clientX, event.clientY);
      if (!point) return;

      event.preventDefault();
      event.stopPropagation();

      transformDragRef.current = { active: true, handleType };

      canvas.focus();

      bus.publish(Topics.INPUT_TRANSFORM_HANDLE_START, {
        handleType,
        x: point.x,
        y: point.y,
        modifiers: {
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey
        },
        timestamp: (event.nativeEvent as MouseEvent).timeStamp
      });
    };
  };

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} tabIndex={0} style={{ display: "block", width: "100%", height: "100%" }} />

      {selectionBoundsScreen && (
        <>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                left: selectionBoundsScreen.x,
                top: selectionBoundsScreen.y,
                width: selectionBoundsScreen.width,
                height: selectionBoundsScreen.height,
                border: "1px solid rgba(255, 127, 14, 0.95)",
                boxSizing: "border-box"
              }}
            />

            <div
              style={{
                position: "absolute",
                left: selectionBoundsScreen.x + selectionBoundsScreen.width / 2,
                top: selectionBoundsScreen.y,
                width: 1,
                height: rotateHandleOffset,
                background: "rgba(255, 127, 14, 0.85)",
                transform: "translate(-0.5px, -100%)"
              }}
            />
          </div>

          <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
            <div
              onMouseDown={onHandleMouseDown("rotate")}
              style={{
                ...handleStyleBase,
                left: selectionBoundsScreen.x + selectionBoundsScreen.width / 2 - handleSize / 2,
                top: selectionBoundsScreen.y - rotateHandleOffset - handleSize / 2,
                borderRadius: handleSize / 2,
                cursor: "grab"
              }}
            />

            <div
              onMouseDown={onHandleMouseDown("scale-nw")}
              style={{
                ...handleStyleBase,
                left: selectionBoundsScreen.x - handleSize / 2,
                top: selectionBoundsScreen.y - handleSize / 2,
                cursor: "nwse-resize"
              }}
            />
            <div
              onMouseDown={onHandleMouseDown("scale-ne")}
              style={{
                ...handleStyleBase,
                left: selectionBoundsScreen.x + selectionBoundsScreen.width - handleSize / 2,
                top: selectionBoundsScreen.y - handleSize / 2,
                cursor: "nesw-resize"
              }}
            />
            <div
              onMouseDown={onHandleMouseDown("scale-se")}
              style={{
                ...handleStyleBase,
                left: selectionBoundsScreen.x + selectionBoundsScreen.width - handleSize / 2,
                top: selectionBoundsScreen.y + selectionBoundsScreen.height - handleSize / 2,
                cursor: "nwse-resize"
              }}
            />
            <div
              onMouseDown={onHandleMouseDown("scale-sw")}
              style={{
                ...handleStyleBase,
                left: selectionBoundsScreen.x - handleSize / 2,
                top: selectionBoundsScreen.y + selectionBoundsScreen.height - handleSize / 2,
                cursor: "nesw-resize"
              }}
            />

            <div
              onMouseDown={onHandleMouseDown("move")}
              style={{
                ...handleStyleBase,
                left: selectionBoundsScreen.x + selectionBoundsScreen.width / 2 - handleSize / 2,
                top: selectionBoundsScreen.y + selectionBoundsScreen.height / 2 - handleSize / 2,
                cursor: "grab"
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
