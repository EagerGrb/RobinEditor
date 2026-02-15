# 阶段一 - PCB 编辑器 UI 组件详细设计

> **面向角色**：前端架构 (frontend-architect)
> **关联任务**：阶段一-frontend-architect-任务清单 -> UI 组件实现
> **用途**：指导具体的 React 组件开发、Props 定义与状态管理。

## 1. 全局布局容器 (LayoutContainer)

采用经典的 IDE 三栏布局：

- **TopBar**: 菜单、工具栏、状态指示。
- **LeftPanel**: 资源与层管理 (Resizable)。
- **Center**: 画布 (Canvas Container)。
- **RightPanel**: 属性面板 (Resizable)。
- **BottomPanel**: 日志与 DRC (Collapsible)。

**组件结构建议**:
```tsx
<Workbench>
  <TopBar />
  <SplitPane split="vertical">
    <LeftPanel width={300} />
    <CenterStage>
       <CanvasWrapper /> {/* 渲染引擎挂载点 */}
    </CenterStage>
    <RightPanel width={280} />
  </SplitPane>
  <BottomPanel height={150} />
</Workbench>
```

---

## 2. 核心面板详细设计

### 2.1 图层控制面板 (LayerPanel)

**功能**：管理层堆栈的可见性、锁定状态与当前活动层。

**UI 构成**:
- **列表项 (LayerItem)**:
  - `EyeIcon`: 切换可见性 (`layer.visible`)。
  - `LockIcon`: 切换锁定 (`layer.locked`)。
  - `ColorBlock`: 显示层颜色 (点击可改色 - 阶段二)。
  - `NameLabel`: 层名称 (如 "Top Layer")。
- **交互**:
  - 点击列表项：**设置当前活动层 (Active Layer)**。活动层需高亮显示。
  - 只有 Signal 和 Silk 层可被设为活动层（Mechanical 层视情况）。

**State / Props**:
```ts
interface LayerPanelProps {
  layers: LayerModel[];
  activeLayerId: string;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onSetActive: (id: string) => void;
}
```

### 2.2 封装库面板 (LibraryPanel)

**功能**：展示可用 Footprint，支持拖拽放置。

**UI 构成**:
- **搜索框**: 过滤 Footprint 名称。
- **列表/网格视图**: 显示 Footprint 缩略图（或占位图标）与名称。
- **交互**:
  - **Drag Start**: 用户开始拖拽某个 Item 时，需设置 `DragData` 包含 `{ footprintId, refPrefix }`。
  - 画布区接收 Drop 事件，或监听 DragOver 实现“幽灵跟随”。

### 2.3 属性面板 (PropertyPanel)

**功能**：基于选中的实体，动态渲染表单。

**设计模式**: **Schema-Driven Form**
- 监听 `SelectionChanged` 事件，获取当前选中的 `entityIds`。
- 调用 `Kernel.getProperties(entityIds)` 获取合并后的属性值与 Schema。
- 根据 Schema 类型渲染控件：
  - `number` -> `<NumberInput unit="mm" />`
  - `boolean` -> `<Switch />`
  - `enum` -> `<Select />`
  - `point` -> `<CoordinateInput x={...} y={...} />`

**多选处理**:
- 若多个实体该属性值相同：显示该值。
- 若不同：显示 `<Mixed Values>` 或空白，修改时应用到所有选中实体。

---

## 3. 工具栏与状态栏

### 3.1 工具栏 (Toolbar)

**工具列表**:
1.  **Select (V)**: 通用选择。
2.  **Place Component (P)**: 放置元件。
3.  **Route Track (W)**: 布线。
4.  **Place Via**: 放置过孔。
5.  **Board Outline**: 绘制板框。

**组件状态**:
- 维护一个 `currentTool` 状态。
- 按钮需有 `active` 样式。
- 快捷键绑定需与按钮点击逻辑复用。

### 3.2 状态栏 (StatusBar)

**显示信息**:
- **左侧**: 当前光标坐标 `(X, Y)`。
- **中间**: 当前操作提示 (如 "Click to start routing, Right click to exit")。
- **右侧**: 网格设置 (Grid Size)、单位 (mm/mil)、缩放比例 (Zoom Level)。

---

## 4. 状态管理与事件总线集成

前端不应直接持有复杂的 PCB 数据 Model，而是持有 **View Model** 或通过 ID 索引。

**Zustand / Redux Store 结构**:
```ts
interface UIState {
  activeLayerId: string;
  currentTool: ToolType;
  selection: string[]; // 选中的 Entity IDs
  panels: {
    leftOpen: boolean;
    rightOpen: boolean;
    // ...
  };
}
```

**事件流**:
1.  用户点击 "Top Layer" -> UI 调用 `CommandService.execute('SetActiveLayer', 'L1')`。
2.  内核处理完毕 -> 发出 `LayerChanged` 事件。
3.  UI 订阅该事件 -> 更新 `UIState.activeLayerId` -> 重绘 LayerPanel。
