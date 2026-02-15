# RenderingCoreExpert-疑问与假设

## 1. Polygon 的挖洞规则
- 文档提到 Canvas 可用非零环绕自动挖洞。
- PCB/EDA 的覆铜/区域常见需求是“外轮廓 + 多个洞”，洞可能来自 Keepout、过孔环形、元件外形等。
- 我在渲染侧新增了 `polygonHoles` 的 `fillRule?: CanvasFillRule`，默认 `nonzero`，可按需要切换 `evenodd`。

## 2. Polyline/Polygon 是否需要支持曲线段
- 文档的 Primitive System 包含 Line/Arc/Bezier，并允许 Polyline 由这些段混合组成。
- 我在渲染侧新增了 `path`（segments 支持 line/arc/bezier）以及单独的 `bezier` 命令。
- 目前 path 渲染策略：如果段之间不连续，会用 moveTo 断开，避免 Canvas 自动连线。

## 3. DrawCommand 与 IRenderer2D 的分层
- 文档里 `IRenderer` 以“直接 drawPrimitive”为主。
- 当前工程的渲染引擎接口是 `updateScene(commands) + render()`，属于更上层的批处理入口。
- 本次按“兼容现有工程”的方式实现：扩展 DrawCommand 以覆盖文档要求的图元表达，而不强制重构接口。
