# 阶段一 - PCB 产品定义与交互细则（详细设计）

> **面向角色**：产品架构师 (product-architect)
> **关联任务**：阶段一-product-architect-任务清单 -> 实体域模型 / 视图与交互风格
> **用途**：作为前端与图形开发实现的“验收标准”，明确每一个像素与每一次点击的行为。

## 1. PCB 实体域模型：详细属性定义

本节定义阶段一 (Phase 1) 必须支持的实体及其属性。所有属性均需在属性面板中可见可编辑（只读除外）。

### 1.1 单板 (Board) 与 板框 (BoardOutline)
- **Board**
  - `origin`: `{x, y}` (原点坐标，默认 0,0)
  - `unit`: `'mm' | 'mil'` (显示单位，底层统一存储为 mm)
- **BoardOutline**
  - `shape`: 多边形 (Polygon)，支持直线段与圆弧段 (Bulge)。
  - **交互限制**：阶段一仅支持闭合轮廓，不处理多重轮廓（挖孔）。

### 1.2 层堆栈 (LayerStack) & 层 (Layer)
- **LayerStack**
  - 固定包含：
    - `TopLayer` (Signal, Red, #FF0000)
    - `BottomLayer` (Signal, Blue, #0000FF)
    - `TopSilk` (Silk, Yellow, #FFFF00)
    - `BottomSilk` (Silk, Green, #00FF00)
    - `Mechanical` (Mech, Purple, #FF00FF)
- **Layer 属性**
  - `visible`: `boolean` (是否渲染)
  - `locked`: `boolean` (是否允许编辑其上的图元)
  - `opacity`: `0.0 - 1.0` (渲染透明度)

### 1.3 封装 (Footprint) 与 焊盘 (Pad)
- **FootprintInstance**
  - `ref`: 字符串 (如 "R1", "U2")，**必填**，板内唯一。
  - `footprintName`: 字符串 (如 "0805", "SOIC-8")，只读。
  - `position`: `{x, y}` (中心点坐标)。
  - `rotation`: 浮点数 (角度制)，支持任意角度，UI 提供 90° 步进。
  - `side`: `'top' | 'bottom'` (所在面)。切换面时自动镜像。
- **Pad**
  - `number`: 字符串 (如 "1", "A1")。
  - `net`: 关联的网络名称 (如 "GND")。
  - `shape`: `'circle' | 'rect' | 'oval' | 'roundedRect'`。
  - `size`: `{width, height}`。
  - `holeSize`: 钻孔直径 (仅 Through 类型有效)。
  - `layer`: 对于 SMT 焊盘为 `Top` 或 `Bottom`；对于通孔为 `MultiLayer`。

### 1.4 走线 (Track) 与 过孔 (Via)
- **Track**
  - `width`: 线宽 (mm)。
  - `net`: 关联网络。
  - `layer`: 所在铜层。
  - `points`: 起点与终点 `{x1, y1, x2, y2}`。
- **Via**
  - `drill`: 钻孔直径。
  - `diameter`: 焊盘外径 (通常 = drill + 2*annularRing)。
  - `net`: 关联网络。
  - `layers`: 连接层范围 (阶段一默认为 Top-Bottom 通孔)。

---

## 2. 交互细则：鼠标与键盘行为

### 2.1 通用操作 (General Interaction)
- **左键单击 (Left Click)**
  - 空白处：清除选择。
  - 实体上：
    - 无修饰键：选中该实体（单选），替换原有选择。
    - `Shift` + 点击：追加/取消选中该实体（多选）。
  - **优先级**：当多个实体重叠时（如 Pad 在 Footprint 上，Track 在 Pad 上）：
    - 优先选中当前活动层 (Active Layer) 的实体。
    - 其次选中“更小/更具体”的实体 (Pad > Footprint)。
    - 提供“循环选择”功能（连续点击同一位置轮询选中）。
- **左键拖拽 (Left Drag)**
  - 空白处起手：**框选 (Box Select)**。
    - 从左向右拖：**包含选择 (Inside)** —— 仅选中完全在框内的物体。
    - 从右向左拖：**交叉选择 (Cross)** —— 选中与框相交或在框内的物体。
  - 实体上起手：**移动 (Move)**。
    - 移动选中的所有实体。
    - 移动过程中显示虚线轮廓预览。
    - 移动结束（松开鼠标）时提交 MoveCommand。
- **中键/滚轮 (Middle/Wheel)**
  - 滚轮滚动：以鼠标指针为中心缩放视图 (Zoom)。
  - 中键按住拖拽：平移视图 (Pan)。
- **右键单击 (Right Click)**
  - 唤起上下文菜单 (Context Menu)。
  - 若当前未选中鼠标下物体，先执行“单选”逻辑再弹出菜单。

### 2.2 放置模式 (Placement Mode)
- **Footprint 放置**
  - 进入模式：鼠标跟随显示 Footprint 幽灵影 (Ghost)。
  - `R` 键：旋转 90 度。
  - `F` 键：翻转 (Flip) 到对侧层（Top <-> Bottom）。
  - 左键单击：放置实例，保持模式以便连续放置。
  - 右键/ESC：退出放置模式。
- **走线 (Routing) 模式**
  - 进入模式：光标变为十字。
  - 左键单击：确定线段起点或转折点。
  - 鼠标移动：显示动态线段（橡皮筋效果），强制 45°/90° 拐角。
  - `Backspace`：回退上一个点。
  - 双击/右键：结束当前走线。
  - 自动吸附：
    - 靠近 Pad 中心、Track 端点、Via 中心时自动吸附。
    - 吸附时显示高亮标记。

---

## 3. 视图风格规范 (Visual Style Guide)

前端与渲染需严格遵循此配色与样式。

| 实体类型 | 颜色 (默认) | 填充 | 边框 | 选中态 | 悬停态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BoardOutline** | `#FF00FF` (紫) | 无 | 1px 实线 | 发光/加粗 | - |
| **Footprint Body** | `#AAAAAA` | 无 | 1px 实线 | 整体包围盒高亮 | 变亮 |
| **Pad (Top)** | `#FF0000` (红) | 实心 | - | 边缘高亮 (白) | 边缘高亮 |
| **Pad (Bottom)** | `#0000FF` (蓝) | 实心 | - | 边缘高亮 (白) | 边缘高亮 |
| **Track (Top)** | `#FF0000` (红) | 实心 (按线宽) | - | 中心线高亮 | - |
| **Track (Bottom)**| `#0000FF` (蓝) | 实心 (按线宽) | - | 中心线高亮 | - |
| **Via** | `#FFFFFF` (孔) + 层色环 | 实心 | - | 边缘高亮 | - |
| **Grid (Main)** | `#333333` | - | 1px | - | - |
| **Background** | `#000000` | 实心 | - | - | - |

- **高亮色 (Selection)**: `#00FF00` (亮绿) 或 `#FFFFFF` (白)，叠加混合模式。
- **不可见层**: 渲染时完全跳过，或以极低透明度 (0.1) 显示（取决于“单层模式”开关）。

---

## 4. DRC 规则骨架 (Design Rules) - 阶段一

阶段一仅实现基于 **NetClass** 的基础几何规则检查。

1.  **Clearance Rule (间距规则)**
    - 定义：不同网络的导电物体（Track/Pad/Via）之间的最小距离。
    - 默认值：`0.2mm` (约 8mil)。
    - 检查逻辑：计算两个 Shape 的最短欧氏距离，若 `< clearance` 则报错。
2.  **Width Rule (线宽规则)**
    - 定义：Track 的宽度限制。
    - 参数：`Min / Preferred / Max`。
    - 检查逻辑：Track 宽度必须 `>= Min` 且 `<= Max`。
3.  **Via Style Rule (过孔规则)**
    - 定义：允许使用的 Via 尺寸。
    - 参数：`MinDrill / MinDiameter`。
    - 检查逻辑：Via 钻孔与外径需满足最小值。

**违规表现 (Violation Display)**:
- 在画布上，违规区域显示醒目的 **X** 标记或高亮轮廓（颜色 `#FFFF00` 黄色警告）。
- 底部面板列出所有 DRC 错误条目，点击可定位。
