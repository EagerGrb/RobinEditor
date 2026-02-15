# EDA 阶段一：基于 Canvas 的 PCB 图形编辑器 —— 需求与任务分发

> 面向智能体：产品架构师（product-architect）、前端架构（frontend-architect）、图形开发专家（graphics-engineer）、渲染引擎专家（rendering-core-expert）、测试专家（qa-automation-expert）。

## 1. 产品定位与阶段目标（PCB）

- 产品形态：
  - 基于 Canvas 技术的 **PCB 2D 编辑器内核**，聚焦 PCB 板级视图（Board View），支持多层、走线、过孔、焊盘等 PCB 核心对象的编辑。
- 阶段一目标：
  - 打通「PCB 场景的基础编辑闭环」：
    - 定义板框（Board Outline）、层堆栈（Layer Stack）；
    - 放置封装（Footprint）与焊盘（Pad）、绘制走线（Track）与过孔（Via）；
    - 支持基本编辑（移动、旋转、镜像、删除）、视图平移与缩放、网格吸附；
    - 支持撤销/重做、最小可用的属性系统与文件编解码；
    - 预留 DRC（设计规则检查）接口，阶段一只做基础几何检查骨架。

## 2. 业务实体（Entity）从「通用 EDA」到「PCB」的映射

- 场景级：
  - `Scene` → `PcbDocument`（PCB 文档）
  - `Sheet / LogicalBlock` → `Board`（单块 PCB 板）

- PCB 结构：
  - `BoardOutline`：板框外形，多边形轮廓；
  - `LayerStack`：层堆栈配置（Top/Bottom/Inner1...、SolderMask、SilkLayer 等）；
  - `Layer`：单层定义（类型、可见性、颜色、顺序）。

- 电气对象：
  - `FootprintInstance`：封装实例，包含若干 `Pad`；
  - `Pad`：焊盘，属于某个 Footprint 或独立焊盘；
  - `TrackSegment`：走线线段，绑定到特定铜层（Top/Bottom/...）；
  - `Via`：过孔，连接多个铜层；
  - `CopperArea`（可选）：覆铜区域（阶段一可仅预留结构，不做复杂布尔运算）；
  - `Net` / `NetClass`：网络与网络类，用于间距/宽度规则。

- 辅助/标注对象：
  - `Dimension`：尺寸标注（板框尺寸等）；
  - `Text / Logo`：丝印文案与标记（阶段一可仅支持简单文本）。

底层内核仍使用 `Primitive / Line / Arc / Polyline / Polygon` 表达几何，PCB 实体通过 Model-View 层转换为渲染图元。

## 3. 阶段一能力范围（PCB 版）

### 3.1 必须完成的基础能力

1. 画布与视口
   - 支持无限平移/缩放的 PCB 画布；
   - 支持毫米/ mil 单位切换；
   - 网格显示与吸附（主网格 + 辅助网格）。

2. 板框与层堆栈
   - 板框（Board Outline）：
     - 绘制/编辑板框多边形（直线 + 圆角/圆弧）；
     - 支持移动/缩放板框（或通过属性设置尺寸）。
   - 层堆栈（Layer Stack）：
     - 至少支持：Top Layer、Bottom Layer、Top/Bottom Silk、Mechanical；
     - 支持在 UI 中查看层列表、切换当前编辑层、控制层可见/锁定。

3. 封装放置与编辑（Footprint + Pad）
   - 放置 FootprintInstance：
     - 从元件库/列表中放置到板上；
     - 支持旋转（90° 步进）、镜像（翻层/翻转）、锁定（防止误移动）。
   - 焊盘（Pad）：
     - 支持在 Footprint 内定义 Pad 的几何（圆形/矩形/椭圆等）和层信息；
     - 支持基本属性（孔径、外径、形状、Net 绑定）。

4. 走线与过孔（Track + Via）
   - 走线工具：
     - 在当前铜层上绘制 TrackSegment；
     - 支持 45°/90° 约束的折线走线；
     - 支持吸附到 Pad、Via、现有 Track 端点；
     - 支持删除/编辑 Track 段。
   - 过孔工具：
     - 放置 Via，自动连接当前层与指定目标层（如 Top<->Bottom）；
     - 支持基本属性（孔径、外径、连接层列表）。

5. 基础编辑与选择
   - 选中/多选：点选、框选、Shift 追加/取消；
   - 移动/旋转/镜像 Footprint/Track/Via 等；
   - 支持基于网格和对象的吸附对齐。

6. 历史记录（命令模式）
   - 对 PCB 操作使用 Command 模式：
     - PlaceFootprintCommand, MoveEntitiesCommand, RouteTrackCommand, PlaceViaCommand 等；
   - 支持撤销/重做，包含拖拽过程的事务合并。

7. 属性系统
   - PCB 实体属性：
     - Footprint：RefDes、封装名、所属网络组（可选）、锁定状态等；
     - Pad：Net、Pad 类型（Through/SMT）、尺寸；
     - Track：Net、宽度、所属层；
     - Via：Net、孔径/外径、连接层等。
   - 通过 Schema + IPropertyProvider 驱动属性面板，修改属性走 Command + HistoryManager。

8. 文件与编解码
   - 在 `.rbeditor` 中为 PCB 定义 PcbDocument 结构：
     - Header + 设置（单位、原点）+ 层堆栈 + 实体列表（Footprints/Pads/Tracks/Vias/Nets...）。
   - 支持行文本编码（用于调试/拷贝）：
     - 每行一个实体记录，比如：
       - `FOOTPRINT|id=...;ref=U1;x=...;y=...;rot=...;layer=TOP`
       - `TRACK|id=...;net=GND;layer=TOP;x1=...;y1=...;x2=...;y2=...;width=...`

9. 快捷键与右键菜单
   - 快捷键：
     - 视图类：缩放、平移复位、缩放到板框；
     - 编辑类：撤销/重做、切换当前层、切换工具（选择/放置 Footprint/走线/放 Via）。
   - 右键菜单（数据驱动 + 命令模式）：
     - 空白处：视图/板级操作（缩放到板框、网格设置）。
     - Footprint 上：移动、旋转、镜像、锁定、属性。
     - Track/Via 上：删除、改变 Net、改变宽度/孔径等（可阶段性简化）。

### 3.2 非目标（阶段一不做）

- 不实现高端自动布线（Autorouter）、差分对/长度匹配等高级布线功能；
- 不实现复杂覆铜布尔运算和热焊盘算法，可预留 CopperArea 结构；
- 不实现完整制造输出（Gerber/ODB++），可阶段性导出调试用 JSON/简单格式。

## 4. 模块与智能体任务分发（PCB 语义）

以下任务均以阶段一为范围，按智能体划分。可以直接将对应小节内容发给相应 Agent。

### 4.1 产品架构师（product-architect）

1. PCB 场景与用户画像梳理
   - 将阶段一锁定为「单板 PCB 编辑」（不做多板/背板系统）。
   - 用户画像：
     - 专业 PCB 工程师（需要规则与精度）；
     - Maker/教育用户（需要上手简单）。
   - 列出关键使用场景：
     - 从原理图导入简单网表并在板上布置；
     - 从空板开始手工放 Footprint、布线；
     - 查看简单的 DRC 提示。

2. PCB 实体域模型定义
   - 明确阶段一实体：
     - PcbDocument、Board、LayerStack、Layer；
     - FootprintInstance、Pad、TrackSegment、Via；
     - Net、NetClass、BoardOutline、Dimension、Text。
   - 为每个实体定义：
     - 核心字段（位置、层、尺寸、网络等）；
     - 与后续阶段（DRC、制造输出）的关系。

3. 阶段一能力边界与里程碑（PCB）
   - M1：画布/板框/层堆栈；
   - M2：Footprint 放置 + 基础编辑；
   - M3：走线/过孔 + 历史记录；
   - M4：属性面板 + 文件编解码 + 基础 DRC 接口。

4. DRC 规则骨架（PCB）
   - 定义 PCB 规则类别：
     - 线宽/孔径/间距规则（NetClass）；
     - 层相关规则（如某些 Net 只能走特定层）。
   - 输出：
     - PCB 版 Rule/RuleViolation 列表（挂载在 02 文档设计规则模块上）。

### 4.2 前端架构（frontend-architect）

1. PCB UI 布局配置
   - 基于 `UILayout` / `PanelConfig`：
     - 左：Footprint/Net 列表、图层面板（Layer 面板可在左或右）；
     - 右：属性面板（针对 Footprint/Pad/Track/Via 等）；
     - 下：日志/DRC 提示；
     - 中：PCB 画布（支持多层叠加显示）。

2. 图层面板与当前层切换 UI
   - 实现 Layer 面板：
     - 列出层堆栈；可见/锁定开关；当前编辑层高亮；
     - 通过消息总线将当前层变更通知图形内核与渲染引擎。

3. Footprint 放置入口与工具面板
   - Footprint 列表面板：
     - 列出可用封装（占位数据即可）；
     - 支持拖拽/点击进入放置模式。
   - 工具栏：
     - 工具按钮（选择、放 Footprint、画线、放 Via、编辑板框）。

4. 属性面板与 PCB 实体对接
   - 对接 PropertyAdapter：
     - 为 Footprint/Pad/Track/Via/BoardOutline 定义 FormSchema 映射；
     - 属性修改以命令形式发送给内核。

5. 快捷键与右键菜单（PCB 版）
   - 快捷键：
     - 切换层（如 PgUp/PgDn）、旋转/镜像 Footprint（R/Mirror）、开始/结束布线等；
   - 右键菜单 UI：
     - 数据驱动的菜单组件，承载 PCB 命令（例：删除 Track、改变 Net、编辑属性）。

### 4.3 图形开发专家（graphics-engineer）

1. PCB 坐标系与视口
   - 使用 Vec2/Mat3 实现：
     - 世界坐标单位（mm/mil）→ 画布像素坐标的转换；
     - 支持中心缩放、平移的视口矩阵；
   - 支持不同缩放级别下的命中/吸附阈值调整。

2. PCB 实体模型与 IPropertyProvider
   - 定义：
     - PcbDocument/Board/Layer/LayerStack；
     - FootprintInstance（带本地坐标系）、Pad、TrackSegment、Via、Net、NetClass；
   - 实现统一属性接口，便于属性面板读取/写入。

3. PCB 工具系统
   - 选择工具：
     - 支持点选/框选 Footprint/Pad/Track/Via/BoardOutline；
   - Footprint 放置工具：
     - 支持网格吸附、旋转/镜像预览；
   - Routing 工具：
     - 在当前层绘制 Track，支持 45°/90° 约束与吸附；
     - 支持放置 Via 切换层；
   - 板框编辑工具：
     - 用多段线编辑 BoardOutline；
   - 每个工具：
     - 实现输入事件处理 + `parseContextMenu` + Command 集成。

4. 历史记录命令实现（PCB 版）
   - 基于 HistoryManager：
     - PlaceFootprintCommand / DeleteFootprintCommand；
     - RouteTrackCommand / DeleteTrackCommand；
     - PlaceViaCommand / DeleteViaCommand；
     - MoveEntitiesCommand / RotateEntitiesCommand / MirrorEntitiesCommand；
     - PropertyChangeCommand（通用属性修改）。

5. PCB 文件与行文本编解码
   - 在 FileCodec 中实现 PCB 相关 encode/decode：
     - 序列化 BoardOutline、LayerStack、Footprints、Tracks、Vias、Nets 到 `.rbeditor`；
   - 行文本：
     - 设计简单的行级格式并实现解析与输出函数，便于调试。

### 4.4 渲染引擎专家（rendering-core-expert）

1. PCB 视图渲染风格
   - 在 IRenderer2D 实现：
     - 板框与机械层轮廓；
     - 多层叠加显示（按层颜色/透明度区分）；
     - Footprint 轮廓与 Pad、Track、Via 的 PCB 风格绘制；
     - 选中/悬停高亮。

2. 性能
   - 针对大规模 PCB：
     - 使用渲染缓存与脏矩形优化重绘；
     - 预留未来 WebGL/WebGPU 的后端接口（暂可只留抽象）。

3. DPI 与视口
   - 正确处理高 DPI 与视口变换，使得线宽/Pad 尺寸在视觉上一致而清晰。

### 4.5 测试专家（qa-automation-expert）

1. PCB 核心流程测试
   - 场景：
     - 新建 PCB → 设定板框与层堆栈 → 放置几个 Footprint→ 布线 + 放 Via → 修改属性 → 撤销/重做 → 保存/加载。

2. 几何与命中测试
   - 单元测试：
     - 点到 Track/Pad/Via 的命中检测；
     - 网格/对象吸附行为；
   - 路由边界：
     - 检查 Track 与板框的关系（不出界）。

3. 文件与行文本一致性
   - PCB 文档级回环测试：
     - PcbDocument → encode → decode → PcbDocument 比对；
   - 行文本：
     - 每行 Entity 的 encode/decode 互逆性测试。

4. 性能与交互体验
   - 在中等规模 PCB（数百 Footprint、数千 Track）下：
     - 测试平移/缩放、框选、撤销/重做的响应时间与 FPS；
   - 记录性能基线，为后续优化提供参考。

---

本文件现在以 PCB 模块为主线：

- 当你调度智能体时，可以直接引用本文件中对应角色的小节；
- 所有 Entity 与任务都已经用 PCB 语义重写，避免与原理图混淆。
