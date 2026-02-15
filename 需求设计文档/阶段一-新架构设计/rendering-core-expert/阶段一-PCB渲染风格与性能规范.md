# 阶段一 - PCB 渲染风格与性能规范

> **面向角色**：渲染引擎专家 (rendering-core-expert)
> **关联任务**：阶段一-rendering-core-expert-任务清单 -> PCB 视图渲染
> **用途**：定义渲染层的具体实现细节、颜色常量与优化策略。

## 1. 渲染层级 (Render Order)

为了保证视觉正确性，渲染必须遵循严格的 Z-Order（从下到上）：

1.  **背景色** (`#000000`)
2.  **Grid** (网格)
3.  **Mechanical Layers** (机械层，如板框 BoardOutline)
4.  **Bottom Layer Stack** (底层堆栈)
    - Bottom Copper (Tracks, Pads, Vias, CopperAreas)
    - Bottom Silk
    - Bottom Overlay
5.  **Inner Layers** (内层，按物理顺序)
6.  **Top Layer Stack** (顶层堆栈)
    - Top Copper
    - Top Silk
    - Top Overlay
7.  **Selection Highlight** (选中高亮层)
8.  **Tool Overlays** (工具层：幽灵影、橡皮筋线、吸附标记)
9.  **Annotation / Cursor** (光标、动态尺寸)

**单层模式 (Single Layer Mode)**:
- 当启用时，非 Active Layer 的其他层透明度降为 `0.1` 或完全隐藏。
- Active Layer 保持不透明。

## 2. 样式常量表 (Style Constants)

```ts
export const PCB_COLORS = {
  // 层预设色
  LAYERS: {
    TOP_LAYER: '#FF0000',    // 红
    BOTTOM_LAYER: '#0000FF', // 蓝
    TOP_SILK: '#FFFF00',     // 黄
    BOTTOM_SILK: '#00FF00',  // 绿
    MECH: '#FF00FF',         // 紫
    BOARD_OUTLINE: '#FF00FF'
  },
  
  // 实体通用
  PAD: {
    THROUGH_HOLE: '#FFFFFF', // 通孔焊盘中心孔颜色
    PLATING_BAR: '#C0C0C0'   // 金属化孔环
  },
  
  // 状态色
  SELECTION: '#FFFFFF',      // 选中高亮（建议使用叠加模式）
  HOVER: 'rgba(255, 255, 255, 0.3)',
  ERROR: '#FFFF00',          // DRC 错误
  GHOST: 'rgba(255, 255, 255, 0.5)' // 放置时的半透明影
};

export const LINE_WIDTHS = {
  GRID_MAJOR: 1,
  GRID_MINOR: 0.5,
  OUTLINE: 2, // 像素
  SELECTION_OUTLINE: 2
};
```

## 3. 几何图元渲染细节

### 3.1 焊盘 (Pad)
- **形状**: 支持 `Round`, `Rect`, `RoundedRect`, `Oval`。
- **多层渲染**:
  - 对于通孔焊盘 (Multi-Layer)，需要在 Top、Bottom 及所有内层绘制 Pad 形状。
  - 需要在中央绘制孔 (Hole)，孔颜色通常为背景色或深灰色（表示钻穿）。
- **Solder Mask (阻焊)**:
  - 阶段一可简化：暂不渲染负片的阻焊层，仅渲染铜层 Pad。

### 3.2 走线 (Track)
- **端点处理**: 使用 `Round Cap` (圆头) 以保证连续走线连接处的平滑。
- **转角**: 连续线段在连接点处直接重叠圆头即可，无需复杂处理。

### 3.3 文本 (Text)
- **字体**: 使用矢量字体 (Vector Font) 或 Canvas 内置字体。
- **对齐**: 支持 Center/Top-Left 等对齐方式。
- **镜像**: 底层文本 (Bottom Silk) 需水平镜像显示。

## 4. 性能优化策略 (Performance)

### 4.1 离屏画布缓存 (Offscreen Canvas)
- **静态层缓存**:
  - 将不常变动的层（如丝印层、非活动铜层）绘制到离屏 Canvas。
  - 主循环中直接 `drawImage` 离屏 Canvas。
- **脏矩形 (Dirty Rect)**:
  - 仅当 Layer 内容变更时重绘该层的离屏 Canvas。
  - 缩放/平移时只需重绘主 Canvas（引用离屏 Canvas），无需重新光栅化矢量图元。

### 4.2 视口剔除 (Frustum Culling)
- 在遍历 Entity 进行绘制前，先判断 Entity.BoundingBox 是否与 CurrentViewport 相交。
- 不相交则直接跳过 `draw` 调用。

### 4.3 LOD (Level of Detail)
- 当缩放比例很小（查看全板）时：
  - 忽略极小的 Text 内容。
  - Pad 的孔径细节可忽略，直接画实心圆。
  - 隐藏 Grid。

## 5. 高 DPI 处理
- 初始化 Canvas 时：
  ```ts
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ```
- 确保所有 `lineWidth` 和坐标计算在逻辑像素空间进行，Canvas 自动处理物理像素映射。
