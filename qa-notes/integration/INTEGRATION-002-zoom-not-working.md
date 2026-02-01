- 用例/问题 ID：INTEGRATION-002
- 严重程度：Major
- 模块（建议 Owner）：editor-web（缩放 UI/快捷键） / integration-graphics（坐标变换） / renderer-canvas2d（渲染变换策略）
- 环境：editor-web 本地开发（Vite）

### 复现步骤

1. 打开应用
2. 尝试使用缩放入口（如：视图-缩放重置、鼠标滚轮、触控板缩放等）
3. 观察画布内容是否发生缩放

### 预期结果

- 画布内容随缩放比例变化（放大/缩小）
- 鼠标位置/视口中心作为缩放锚点时，交互直觉一致
- 缩放后 hitTest、吸附阈值等仍以屏幕像素为准表现稳定

### 实际结果

- 缩放无效果（画布内容始终 1:1）
- 视口 scale/offset 在状态层已变化（选中包围盒 overlay 会随之变化），但 Canvas 实际绘制未缩放

### 怀疑原因（技术判断）

- GraphicsKernel 已产出 `viewTransform`（随 zoom/pan 变化），但渲染链路未应用：
  - `GRAPHICS.DRAW_COMMANDS_CHANGED` 携带 `viewTransform`
  - `SceneDrawData` 也支持 `viewTransform`
  - 但 Canvas2DRenderer 当前仅处理 DPR transform，未将 `viewTransform` 叠加到 ctx

### 修复建议（可执行）

- 在 integration-rendering -> renderer.updateScene(payload) 的 payload 中透传 `viewTransform`
- 在 Canvas2DRenderer 中叠加 `viewTransform` 到绘制坐标系（与 DPR transform 组合）
- 输入事件继续以 screen 坐标上报，由 kernel 内部 `screenToWorld` 统一换算

### 验收标准 / 回归点

- 缩放后拖拽跟手、框选、吸附阈值一致
- DPR 不同（1/2）下缩放表现一致
- 极端缩放（0.1x、10x）不抖动、不漂移、不出现选不中/吸附失效
