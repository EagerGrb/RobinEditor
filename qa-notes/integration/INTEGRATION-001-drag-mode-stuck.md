- 用例/问题 ID：INTEGRATION-001
- 严重程度：Critical
- 模块（建议 Owner）：editor-web（CanvasContainer 变换手柄拖拽状态机） / integration-graphics（变换拖拽事件链路）
- 环境：editor-web 本地开发（Vite）

### 前置条件

- 画布内存在可选中图元（墙/门窗/标注任意一种）

### 复现步骤（最小）

1. 选择工具（选择/V）
2. 点击图元使其进入选中态（出现选中包围盒与变换手柄）
3. 按住任意一个变换手柄开始拖拽（中心 move / 旋转 / 任意缩放角点）
4. 将鼠标移出浏览器窗口，再松开鼠标
5. 将鼠标移回画布区域，尝试：
   - 切换到墙体绘制/门窗放置/标注工具
   - 或在画布中进行其他交互（点击选择/框选/绘制）

### 预期结果

- 松开鼠标后应退出拖拽态
- 可正常切换到其他工具并继续操作

### 实际结果

- 松开鼠标后仍处于“手柄拖拽模式”
- 后续交互异常：
  - 画布持续响应 `INPUT_TRANSFORM_HANDLE_DRAG`（即使未按键）
  - 画布 `mousedown` 被直接拦截（导致无法进行其他操作）

### 怀疑原因（技术判断）

- `mouseup` 在“鼠标在浏览器外释放”场景下丢失，导致 `transformDragRef` 一直保持 active
- 缺少“中断拖拽”兜底路径：窗口 blur/visibilitychange、pointercancel 未统一触发 end
- 指针捕获缺失：未用 Pointer Events + capture，拖拽越界时易丢失 up/cancel

### 影响范围

- 关键路径：选择与拖拽（所有图元的编辑入口）
- 影响工具切换：进入卡死态后用户无法继续编辑

### 修复建议（可执行）

- 输入层改为 Pointer Events，并在手柄 `pointerdown` 时 `setPointerCapture`
- 监听 `pointercancel`、`blur/visibilitychange`，统一触发 `INPUT_TRANSFORM_HANDLE_END`
- 为“任何一次 mouseup/pointerup”提供兜底释放（即使释放点在窗口外）

### 验收标准 / 回归点

- 任意拖拽结束（松开鼠标/窗口失焦/指针取消）后，都能：
  - 立即停止移动
  - 正常选择/框选
  - 正常切换工具并绘制
- 极端场景：拖拽中把鼠标移出浏览器窗口再松开，也不会卡在拖拽态
