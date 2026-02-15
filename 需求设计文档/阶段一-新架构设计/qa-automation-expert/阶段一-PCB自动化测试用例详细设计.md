# 阶段一 - PCB 自动化测试用例详细设计

> **面向角色**：测试专家 (qa-automation-expert)
> **关联任务**：阶段一-qa-automation-expert-任务清单 -> PCB 自动化测试
> **用途**：提供可脚本化的测试用例集，明确测试步骤与期望结果。

## 1. 测试环境与工具 (Test Environment)

**工具**: Playwright / Cypress / Jest
- **Frontend**: 直接操作 DOM 元素、Canvas Overlay 层、UI 面板。
- **Core (Headless)**: 通过暴露的 `window.__EDA_CORE__` 访问 API (如 `PcbDocument`, `SelectionManager`, `HistoryManager`)。

**Hook**:
- 所有核心组件需提供 `data-testid` (如 `footprint-list`, `layer-top`, `tool-route`)。
- 核心操作完成后需发出 DOM 事件或状态变更信号 (如 `canvas-ready`, `route-finished`)。

---

## 2. 端到端流程用例 (E2E Scenarios)

### 2.1 [Smoke] PCB 新建与简单编辑

**步骤**:
1.  **Launch**: 打开应用，点击 "New Project" -> "New PCB"。
    - **Expect**: 画布显示默认板框 (100x100mm)，默认层堆栈 (Top/Bottom + Silk + Mech)，单位 mm。
2.  **Add Footprint**: 从左侧面板拖拽 "R0805" 到画布 (50, 50)。
    - **Expect**: 画布上显示 R0805，Ref 为 "R1" (自动编号)，Layer 为 Top。
    - **Verify**: `doc.footprints.length === 1`。
3.  **Move Footprint**: 选中 R1，拖动到 (60, 60)。
    - **Expect**: R1 位置变为 (60, 60)。
    - **Verify**: `footprint.position` === `{x: 60, y: 60}`。
4.  **Rotate**: 按 `R` 键。
    - **Expect**: R1 旋转 90 度。
    - **Verify**: `footprint.rotation === 90`。
5.  **Undo**: 点击 Undo 按钮或 `Ctrl+Z`。
    - **Expect**: R1 旋转变回 0 度。
    - **Verify**: `footprint.rotation === 0`。
6.  **Redo**: 点击 Redo 按钮或 `Ctrl+Y`。
    - **Expect**: R1 旋转变为 90 度。

### 2.2 [Functional] 布线与过孔 (Routing & Vias)

**步骤**:
1.  **Select Net**: 在 NetManager 中创建网络 "NET_A"。
2.  **Route Start**: 选择布线工具 (W)，点击 (10, 10)。
3.  **Route Move**: 移动鼠标到 (20, 20)。
    - **Expect**: 显示折线预览，第一段水平/垂直，第二段 45 度。
4.  **Route Click**: 点击 (20, 20) 确定拐点。
    - **Expect**: 生成一段 Track。
5.  **Place Via**: 按 `V` 键。
    - **Expect**: 当前位置放置过孔，且当前活动层切换到 Bottom Layer。
    - **Verify**: `doc.vias.length === 1`，`activeLayer === 'Bottom'`。
6.  **Route End**: 双击结束。
    - **Expect**: 完成布线。
    - **Verify**: `doc.tracks` 包含相应线段，`doc.vias` 包含过孔，网络均为 "NET_A"。

### 2.3 [Validation] DRC 基础检查

**步骤**:
1.  **Setup**: 设置 Clearance 规则为 0.5mm。
2.  **Conflict**: 将 Track 移动到距离 Pad 0.1mm 处。
    - **Expect**: Track 与 Pad 均高亮显示 DRC 错误标记。
    - **Verify**: `DRCManager.violations.length > 0`。
3.  **Fix**: 将 Track 移开到 0.6mm 处。
    - **Expect**: DRC 错误标记消失。
    - **Verify**: `DRCManager.violations.length === 0`。

---

## 3. 几何算法单元测试 (Unit Tests)

**针对 `graphics-kernel`**:

### 3.1 命中测试 (Hit Test)
- **Point inside Rect**: 点 (0,0) 是否在 Rect(-10,-10, 20,20) 内 -> True。
- **Point near Line**: 点 (0, 0.1) 到 Line((-10,0)-(10,0)) 距离 -> 0.1。
- **Selection**: 框选 Rect(0,0, 10,10) 是否包含 Point(5,5) -> True。

### 3.2 多边形操作 (Polygon Ops)
- **Offset**: 对 Rect(0,0, 10,10) 进行 offset(1) -> 结果应为 Rect(-1,-1, 12,12) (近似)。
- **Boolean**: RectA subtract RectB -> 结果多边形顶点正确。

---

## 4. 文件一致性测试 (File Consistency)

**步骤**:
1.  **Generate**: 程序生成一个包含所有类型实体的复杂 PCB 文档 (Model)。
2.  **Serialize**: `json = Codec.encode(doc)`。
3.  **Deserialize**: `doc2 = Codec.decode(json)`。
4.  **Compare**: DeepEqual(doc, doc2)。
    - **Expect**: 所有字段完全一致，无精度丢失。
5.  **Line Protocol**: `lines = LineCodec.encode(doc)` -> `doc3 = LineCodec.decode(lines)`。
    - **Expect**: DeepEqual(doc, doc3) (允许浮点数微小误差)。

---

## 5. 性能基准 (Performance Benchmark)

**场景**: 加载 "Demo_Board_Medium.json" (500 Components, 3000 Tracks)。

**指标**:
- **Load Time**: < 1000ms (从加载到首屏渲染)。
- **Pan/Zoom FPS**: > 55fps (持续拖拽画布)。
- **Selection Time**: < 50ms (框选 500 个物体)。
- **Memory**: < 200MB (Heap Snapshot)。
