# 阶段一任务包：graphics-engineer

使用方式：本任务包用于指导你实现图形编辑器内核，包括工具链（职责链模式）、绘制工厂、中间层 MVC（Model/View/Controller）、交互逻辑与几何算法。你只与抽象渲染接口和 UI 中介者交互，不直接感知具体 UI 组件或渲染技术细节。

## 一、内核总体设计

1. 定义 IGraphicsKernel 接口
   - 职责：
     - 维护场景数据（加载、保存、重置）。
     - 管理当前工具及工具链。
     - 处理规范化输入事件（来自中介者，而非原生 DOM）。
     - 输出渲染描述（供渲染引擎使用）。
   - 输出：接口定义草案（以 TypeScript interface 形式记录方法名、参数、返回类型）。

2. 内部模块划分
   - 核心模块：
     - SceneManager：场景数据与拓扑管理。
     - ToolChain：工具系统与职责链管理。
     - Controllers：图元级交互控制器集合。
     - ViewGenerator：从模型生成渲染描述。
     - GeometryUtils：几何算法工具库。
   - 输出：模块关系图与职责简述。

## 二、数据模型：图元 Model / View / Controller

3. 基础几何类型
   - 定义 Point, Vector2, Transform2D, Rect 等类型。
   - 确保支持矩阵变换（平移、缩放），为视图转换做准备。

4. 图元 Model 设计
   - 通用基类/接口（如 `ShapeModel`）：
     - 字段：id, type, transform, boundingBox, metadata。
   - 具体图元：
     - WallModel：起点、终点、厚度、高度、所属房间等属性。
     - OpeningModel：门/窗，关联 wallId，沿墙体的 parametric 位置（0~1）及尺寸。
     - DimensionModel：两点或多点标注、显示文本、样式信息。
     - GridModel：网格间距、可见性配置等。
   - 输出：模型字段定义与约束说明。

5. View 描述（渲染中立）
   - 定义抽象绘制指令类型：
     - Line, Polyline, Polygon, Arc, Text 等。
     - 包含样式信息（线宽、颜色、虚线、填充等）。
   - 每种 Model 通过 ViewGenerator 或专门的转换函数转换为一组绘制指令。
   - 要求：View 不依赖具体 Canvas API，仅描述「画什么」。

6. Controller 设计
   - 为每种图元类型设计 Controller：
     - WallController：处理墙体端点拖拽、整段移动、约束与吸附。
     - OpeningController：处理门窗在墙上的移动、合法区间校验。
     - DimensionController：处理标注点的拖拽、更新与对齐辅助。
   - Controller 接收统一格式的输入事件（指针/键盘），控制 Model 状态变更，并通知 SceneManager。

## 三、工具链与职责链模式

7. Tool 接口定义
   - 生命周期：
     - onEnter(previousTool), onExit(nextTool)。
     - 事件处理：onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onKeyDown, onKeyUp 等。
   - 每个 Tool 只关注其「职责范围」内的交互，不直接处理渲染。

8. ToolChain 管理
   - 实现 ToolChain：维护当前激活工具栈（支持叠加临时工具）。
   - 对输入事件进行分发：
     - 将规范化输入事件按顺序交给工具链处理。
     - 工具可决定事件是否继续向后传递（职责链模式）。

9. 基础工具实现
   - 选择工具（SelectionTool）：
     - 单击命中测试（点到图元距离/边界盒判定）。
     - 框选（拖拽形成矩形区域选中）。
     - 支持多选与取消选中。
   - 墙体绘制工具（WallDrawingTool）：
     - 通过连续点击绘制折线形式的墙体。
     - 动态显示「橡皮筋」预览线段及实时长度/角度。
     - 双击或 ESC 结束绘制，自动整理墙体拓扑（共享端点）。
   - 门窗放置工具（OpeningPlacementTool）：
     - 响应来自 UI 的「开始放置特定门/窗」命令。
     - 在墙体上拖拽，计算沿墙体的 parametric 位置和合法范围。
     - 确保不能越过墙体端点或跨越断点。
   - 尺寸标注工具（DimensionTool）：
     - 交互式选取两个或多个点生成 DimensionModel。
     - 提供标注拖拽调整位置的逻辑（例如偏移线位置）。

## 四、几何与算法

10. 坐标体系与矩阵变换
    - 维护世界坐标与视图坐标的转换矩阵（来自外部的视图控制参数）。
    - 提供：
      - worldToScreen(point: Point) -> Point。
      - screenToWorld(point: Point) -> Point。

11. 命中测试与选中判定
    - 点到线段的距离算法：
      - 输入：点 P、线段 AB。
      - 输出：实际距离及投影点位置（用于吸附）。
      - 结合当前缩放比例，判断是否被视为命中。
    - 框选判定：
      - 使用图元 boundingBox 与选择矩形的相交测试。

12. 吸附算法
    - 网格吸附：
      - 根据配置的网格间距，将输入点吸附到最近网格点。
    - 端点吸附：
      - 遍历附近墙体端点，找到距离最近且在阈值内的端点进行吸附。
    - 墙线吸附：
      - 对当前点投影到各墙体线段上，选取距离最近且落在线段内的投影点。
    - 吸附阈值随缩放动态调整，配合 UI 提供的「临时关闭吸附」信号。

13. 拓扑与约束管理
    - 墙体拓扑结构维护：
      - 使用节点（端点）和边（墙体）表示结构。
      - 新墙体绘制时，检查端点是否接近已有节点，若接近则合并。
    - 门窗与墙体约束：
      - 确保 OpeningModel 的位置与宽度在墙体长度范围内。
      - 在墙体被修改时同步更新门窗位置（如 parametric 位置不变）。

## 五、内核与外部模块交互

14. 输入事件接口
    - 接受来自中介者的规范化事件：
      - 指针事件：type, worldPosition, screenPosition, buttons, modifiers。
      - 键盘事件：key, modifiers。
    - 内核对事件进行分发：
      - 先经过 ToolChain。
      - Tool 决定是否调用对应 Controller 或 SceneManager。

15. 场景变更与通知
    - 内核在场景变更后，将变更信息汇总为「变更集」：
      - 新增/删除/更新的图元列表。
    - 通过事件或回调通知外部（中介者），由中介者再转发给：
      - UI（更新选中状态、属性面板）。
      - 渲染引擎（更新绘制指令）。

16. 渲染描述输出
    - 接口：`getDrawCommands(): DrawCommand[]` 或增量更新接口。
    - 内容：图元生成的 View 描述（包含图层顺序与状态标记：normal/hover/selected）。
    - 不直接调用具体渲染 API，仅生成数据。

## 六、可测试性与扩展

17. 可测试性设计
    - 确保几何算法与工具逻辑可以在无 DOM 环境下进行单元测试。
    - 将复杂逻辑拆分为纯函数，便于 qa-automation-expert 为你编写/执行测试。

18. 扩展性
    - 在工具系统与图元系统中预留扩展点：
      - 支持未来增加新的工具（如标注类型、辅助构造线）。
      - 支持添加更多图元类型而不破坏现有接口。

