# 阶段一任务包：frontend-architect

使用方式：本任务包用于指导你搭建阶段一的 Web 前端架构和图形编辑器 UI 框架，技术栈为 React + TypeScript + 主流 UI 库（由你最终拍板）。

## 一、Monorepo 与基础设施

1. 选择并初始化 Monorepo 工具
   - 评估 Nx 与 Turborepo（或其他方案），给出选型结论和简要对比。
   - 初始化 Monorepo 项目结构，推荐结构示意：
     - `apps/editor-web`：主 Web 应用。
     - `packages/ui-shell`：编辑器 UI 框架（布局、面板、菜单）。
     - `packages/event-bus`：全局发布订阅消息总线实现。
     - `packages/integration-graphics`：UI 与图形内核的中介集成层。
     - `packages/integration-rendering`：图形内核与渲染引擎的中介集成层。

   - 选型结论：Turborepo + pnpm。
   - 简要对比：
     - Nx：能力更“全家桶”（生成器、依赖图、分布式缓存、测试/构建集成更深入），但心智负担与配置成本更高，早期迭代容易“先工具后业务”。
     - Turborepo：更轻量、以任务编排与缓存为核心，上手快、对 React/Vite 单体 + 多包的场景足够；适合阶段一快速打通 UI/事件/集成链路。
     - 结论：阶段一优先交付可运行的编辑器骨架与协作契约，选择 Turborepo 更契合“快启动、低摩擦”。

2. TypeScript 与构建配置
   - 建立根 tsconfig，并为各 package 提供继承配置（路径别名、严格模式等）。
   - 选择构建/开发工具（优先 Vite 或 Webpack），配置 HMR。
   - 确保 dev 环境下能启动 `editor-web` 应用并显示基础布局占位。

## 二、UI 规范与基础布局

3. 选定 UI 组件库并输出规范
   - 在 Ant Design / MUI / 其他库中选定其一。
   - 输出简单 UI 规范：主题色、字号、组件使用约定（按钮、面板、菜单）。

   - 选型结论：Ant Design v5（默认暗色主题算法）。
   - UI 规范（阶段一最小集）：
     - 主题色：#2F6BFF。
     - 基准字号：13px。
     - 面板：统一使用 Card / Divider 组织信息，避免自定义复杂样式。
     - 按钮：工具区用 primary 表示当前工具，其余 default。
     - 菜单：顶部用点击下拉，命令通过 event-bus 统一分发。

4. 编辑器主布局实现（`ui-shell` 包）
   - 实现 EditorShell 组件，包含：
     - 顶部菜单栏区域（提供菜单插槽）。
     - 左侧面板区域：用于工具栏和组件库。
     - 右侧面板区域：用于属性面板。
     - 底部状态/日志区域（可折叠）。
     - 中央画布区域：用于挂载 Canvas 容器。
   - 要求：布局在 1080p/2K 分辨率下表现良好，可简单响应式适配。

## 三、菜单、面板与交互组件

5. 顶部菜单栏组件
   - 定义菜单数据结构（如 `MenuItem`：key、label、children、command）。
   - 实现菜单渲染组件，支持下述基础菜单项：
     - 文件：新建、打开、保存（触发对应命令事件）。
     - 视图：缩放重置、适配视口、网格开关。
     - 编辑：撤销、重做（先只发事件）。
   - 通过 event-bus 发布菜单点击事件（包含 command 标识与参数）。

6. 左侧工具面板
   - 实现工具列表组件，包含至少：选择、墙体绘制、门窗放置、尺寸标注四类工具。
   - 每个工具按钮展示：图标、名称、快捷键提示。
   - 工具切换时：
     - 更新本地 UI 状态（高亮当前工具）。
     - 通过 event-bus 发送 `UI.TOOL_CHANGED` 事件（携带工具类型）。

7. 右侧属性面板
   - 实现属性面板容器组件，可根据选中对象类型渲染不同子面板：
     - 墙体属性：厚度、高度、材质标记等。
     - 门窗属性：类型、宽度、高度、开启方向等。
     - 尺寸属性：精度、标注风格等。
   - 通过 event-bus 订阅 `GRAPHICS.SELECTION_CHANGED`：
     - 根据 payload 中的对象类型与 ID，显示对应属性编辑界面。
   - 用户修改属性时：
     - 通过 event-bus 发送 `UI.OBJECT_PROPERTIES_CHANGED` 事件（携带对象 ID 和新属性值）。

8. 底部状态栏/日志面板
   - 状态栏显示：当前工具、座标（鼠标位置）、缩放比例、吸附状态等。
   - 日志面板接收 event-bus 中标记为「日志/调试」的事件，滚动展示简要信息。

## 四、事件采集与发布订阅核心

9. 实现通用 event-bus（`packages/event-bus`）
   - 提供基础 API：`subscribe(topic, handler)`, `unsubscribe`, `publish(topic, payload)`。
   - 支持：
     - 一个 topic 多个订阅者。
     - 简单的中间件机制（例如：日志记录、节流/防抖）。
   - 约定事件命名空间（如：`UI.*`, `INPUT.*`, `GRAPHICS.*`, `RENDER.*`）。

10. 画布容器组件的输入事件采集
    - 在 `editor-web` 中提供 CanvasContainer 组件：
      - 底层持有一个 HTMLCanvasElement 引用。
      - 原生绑定鼠标/键盘事件：mousedown/mousemove/mouseup/wheel/contextmenu、keydown/keyup。
      - 将事件转换为规范化对象（包含：屏幕坐标、修饰键、时间戳）。
      - 通过 event-bus 发布 `INPUT.MOUSE_*` 与 `INPUT.KEY_*` 事件，绝不直接依赖图形内核实现。

11. 中介者集成层（与图形内核）
    - 在 `packages/integration-graphics` 中实现 GraphicsMediator：
      - 订阅来自 event-bus 的 UI 和 INPUT 事件。
      - 调用图形内核的 `IGraphicsKernel` 接口（由 graphics-engineer 定义和实现）。
      - 监听图形内核的状态变更（如选中变化、场景更新），转换为 event-bus 的事件广播给 UI。

12. 中介者集成层（与渲染引擎）
    - 在 `packages/integration-rendering` 中实现 RenderingMediator：
      - 订阅图形内核输出的渲染描述或变更集事件。
      - 调用 `IRenderer2D` 接口的相关方法执行绘制。
      - 将渲染层的性能信息/异常通过 event-bus 广播给 UI（例如显示在状态栏）。

## 五、性能与扩展性

13. React 性能优化
    - 确保画布区域使用 `useRef` 持有，避免每帧重渲染 React 组件。
    - 对高频刷新区域使用 memo/纯组件策略减压。

14. 可扩展布局
    - 预留添加更多面板或多画布视图的插槽机制。
    - 为未来 WebGL / WebGPU 视图增加区域预留接口（例如多 Tab 或分屏布局）。

15. 开发体验
    - 配置基础 Lint（ESLint + TypeScript）与格式化（Prettier）。
    - 提供一键启动命令（如 `pnpm dev`）和基础文档，让其他智能体可以在本地快速运行编辑器。

   - 已落地：ESLint（flat config）+ Prettier。
   - 一键启动：
     - 安装依赖：`pnpm i`
     - 启动开发：`pnpm dev`（启动 apps/editor-web）
     - 校验：`pnpm lint` / `pnpm typecheck`
