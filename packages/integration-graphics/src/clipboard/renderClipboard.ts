import type { EntityModel, Point, Rect } from "@render/graphics-kernel";

export const RENDER_CLIPBOARD_PREFIX_V1 = "render:clipboard:v1:";

export type RenderClipboardPayloadV1 = {
  app: "render";
  version: 1;
  kind: "pcb.entities";
  createdAt: number;
  bounds: Rect | null;
  entities: EntityModel[];
};

export function encodeClipboardPayload(payload: RenderClipboardPayloadV1): string {
  return `${RENDER_CLIPBOARD_PREFIX_V1}${JSON.stringify(payload)}`;
}

export function decodeClipboardPayload(text: string): RenderClipboardPayloadV1 | null {
  if (typeof text !== "string") return null;
  const raw = text.startsWith(RENDER_CLIPBOARD_PREFIX_V1) ? text.slice(RENDER_CLIPBOARD_PREFIX_V1.length) : text;
  try {
    const obj = JSON.parse(raw) as RenderClipboardPayloadV1;
    if (!obj || obj.app !== "render" || obj.version !== 1 || obj.kind !== "pcb.entities") return null;
    if (!Array.isArray(obj.entities)) return null;
    return obj;
  } catch {
    return null;
  }
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

