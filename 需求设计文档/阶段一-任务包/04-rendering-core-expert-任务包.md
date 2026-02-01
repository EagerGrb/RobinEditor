# 阶段一任务包：rendering-core-expert

使用方式：本任务包用于指导你实现阶段一的 2D 渲染引擎。你只关心「如何把抽象的绘制描述高效画出来」，不关心图形内核的业务逻辑和 UI 细节。所有交互通过中介者与消息总线进行对接。

## 一、渲染接口设计（面向接口编程）

1. 定义 IRenderer2D 接口
   - 职责：
     - 初始化渲染上下文（绑定 Canvas）。
     - 接收 draw commands 或渲染描述。
     - 执行一次或持续渲染。
     - 响应窗口尺寸变化。
   - 建议方法：
     - `init(canvas: HTMLCanvasElement, options?: RendererOptions)`。
     - `updateScene(commands: DrawCommand[] | SceneDrawData)`。
     - `render()` 或 `startLoop()` / `stopLoop()`。
     - `resize(width: number, height: number)`。

2. 定义 DrawCommand / Scene 描述结构
   - 基本图元类型：
     - Line, Polyline, Polygon, Arc, Circle, Text, Image。
   - 样式字段：
     - strokeColor, fillColor, lineWidth, lineDash, opacity, font, textAlign 等。
   - 渲染状态：
     - normal, hover, selected（用于调整颜色与线宽）。
   - 图层/顺序控制：
     - zIndex 或 layer 字段，保证网格、辅助线、墙体、门窗、尺寸标注的绘制顺序正确。

3. 与图形内核的契约
   - 仅通过接口接受数据：
     - 不直接访问内核内部结构。
   - 由中介者负责：
     - 将 `IGraphicsKernel` 输出的渲染描述转换为渲染接口所需的 DrawCommand 列表。

## 二、Canvas 2D 渲染实现

4. 实现 renderer-canvas2d 模块
   - 在独立的包（例如 `renderer-canvas2d`）中实现 IRenderer2D 接口的 Canvas 2D 版本。
   - 仅依赖原生 Canvas 2D API，不夹杂业务逻辑。

5. 高 DPI 适配
   - 根据 window.devicePixelRatio 调整 Canvas 的宽高与缩放：
     - 逻辑大小与实际像素大小分离。
   - 确保在 1/1.5/2 等不同 DPR 下线条与文字清晰，不模糊。

6. 绘制顺序与层级管理
   - 明确绘制层级：
     - 底层：网格、参考线。
     - 中层：墙体、门窗等主要构件。
     - 上层：尺寸标注、选中高亮、控制点。
   - 按 zIndex 或预先约定好的 layer 顺序排序后再绘制。

7. 文本与标注绘制
   - 实现尺寸文本绘制：
     - 支持对齐方式（居中、左/右对齐）。
     - 控制字体大小在不同缩放下仍可读。
   - 支持度量单位格式（例如：小数位数控制、单位后缀）。

8. 选中与 Hover 状态表现
   - 为 `hover` 和 `selected` 状态定义：
     - 专用颜色、线宽、虚线样式等。
   - 渲染时根据 DrawCommand 的状态字段应用不同样式。

## 三、性能与增量渲染

9. 基础性能优化
   - 避免每帧完全清空并重绘所有内容（除非必要）。
   - 通过批处理相似样式的图元减少状态切换（如一次性设置 strokeStyle 后绘制多条线）。

10. 增量渲染与脏矩形
    - 支持传入「变更集」：只重绘发生变化的区域。
    - 方案示意：
      - 由图形内核或中介者提供受影响区域的 bounding box 列表。
      - 在 Canvas 上对这些区域进行清理并重绘对应图元。

11. 帧率与渲染节奏
    - 统一渲染节奏：
      - 使用 requestAnimationFrame 驱动渲染循环，或在有变更时触发一次渲染。
    - 提供简单统计：
      - 每帧耗时、图元数量、draw call 次数等（为状态栏展示提供数据）。

## 四、与外部模块交互（通过中介者）

12. 与 RenderingMediator 的交互
    - 接口示意：
      - RenderingMediator 调用：`renderer.updateScene(drawCommands)`。
      - RenderingMediator 控制何时调用 `renderer.render()` 或开启循环。
    - 渲染模块不直接订阅消息总线，由中介者负责事件监听和数据转换。

13. 错误与异常反馈
    - 若渲染过程中出现异常（如无效指令、样式错误）：
      - 提供错误回调或事件，让中介者将错误信息通过消息总线发送给 UI 和 QA。

## 五、可测试性与可扩展性

14. 单元测试与可视化回归测试
    - 设计可注入的 Canvas 渲染上下文，使得在测试环境中可以使用 mock 或离屏 Canvas。
    - 对固定的 DrawCommand 列表进行渲染，并截取像素或快照进行对比（允许一定容差）。

15. 扩展到 WebGL/WebGPU 的准备
    - IRenderer2D 接口设计要足够「渲染技术无关」，方便未来增加：
      - IRenderer3D（WebGL）
      - IRendererGPU（WebGPU）
    - 不在本阶段实现，但在命名和结构上避免技术耦合。

16. 性能调优与诊断接口
    - 暴露一个简要的诊断接口：
      - 获取最近一次渲染的统计数据（耗时、图元数、分层数据量）。
    - 供 UI 或 QA 展示和分析性能瓶颈。

