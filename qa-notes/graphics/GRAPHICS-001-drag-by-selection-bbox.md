- 用例/问题 ID：GRAPHICS-001
- 严重程度：Major
- 模块（建议 Owner）：editor-web（CanvasContainer 选中包围盒交互热区） / integration-graphics（SelectionTransform 触发）
- 环境：editor-web 本地开发（Vite）

### 前置条件

- 已选中一个或多个图元

### 复现步骤

1. 选中图元（出现选中包围盒与手柄）
2. 将鼠标移动到“选中包围盒内部空白处”（不要点中心 move 小手柄）
3. 鼠标按下并拖动

### 预期结果

- 只要鼠标按下点位于当前选中集合包围盒范围内，就应进入移动拖拽
- 移动拖拽的热区应覆盖包围盒内部（而非仅中心一个小手柄）

### 实际结果

- 包围盒内部空白处按下无法拖拽（常见表现：触发框选/无响应）
- 只能通过中心 move 小手柄进入移动拖拽

### 怀疑原因（技术判断）

- 当前移动拖拽入口是“中心 move 小手柄”（固定小热区），未将包围盒内部定义为可拖拽区域
- 包围盒边框层 `pointerEvents` 策略导致内部区域未参与命中判定

### 修复建议（可执行）

- 在 CanvasContainer 中为包围盒内部增加 move 热区（透明层）并触发 `INPUT_TRANSFORM_HANDLE_START(handleType=move)`
- 热区判定使用已下发的 `selectionBoundsWorld`（或其 screen 映射后的 rect）

### 验收标准 / 回归点

- 包围盒内任意点按下均可拖拽
- 多选时包围盒 union 行为正确
- 包围盒外按下仍保持当前框选/取消逻辑不变
