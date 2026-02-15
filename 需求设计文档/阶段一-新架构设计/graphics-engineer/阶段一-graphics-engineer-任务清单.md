# 阶段一 - 图形开发专家（graphics-engineer）任务清单

> 目标：把所有与 PCB 模型、工具系统、文件/行文本编解码、几何与命中相关的实现任务集中到一份清晰的列表中。

## 0. 关联设计文档

- [00-架构总览与模块划分](../00-架构总览与模块划分.md)
- [02-核心数据与文件系统-详细设计](../02-核心数据与文件系统-详细设计.md)
- [03-图形内核与算法-详细设计](../03-图形内核与算法-详细设计.md)
- [04-基础设施与数据结构-详细设计](../04-基础设施与数据结构-详细设计.md)
- [05-历史记录系统-详细设计](../05-历史记录系统-详细设计.md)
- [06-属性系统与数据绑定-详细设计](../06-属性系统与数据绑定-详细设计.md)
- [07-图形内核-几何算法库-详细设计](../07-图形内核-几何算法库-详细设计.md)
- [EDA-阶段一-需求与任务分发](../EDA-阶段一-需求与任务分发.md)
- [PCB-图元与流式编码-任务分发-graphics-engineer](../PCB-图元与流式编码-任务分发-graphics-engineer.md)

---

## 1. PCB 坐标系与视口

1. 实现 PCB 级坐标系与视口变换：
   - Vec2/Mat3 工具（或基于现有数学库）；
   - 世界坐标（mm/mil）↔ 画布像素坐标转换；
   - 支持中心缩放与平移的视口矩阵。
2. 为不同缩放级别设计命中/吸附阈值策略，并在命中逻辑中使用。

## 2. PCB 实体模型与属性接口

1. 根据 PCB 图元文档实现 Model 层：
   - PcbDocumentModel / BoardModel / LayerStackModel / LayerModel；
   - NetModel / NetClassModel；
   - FootprintModel / PadModel；
   - TrackModel / ViaModel / CopperAreaModel / TextModel / DimensionModel。
2. 所有实体实现统一的接口：
   - IEntity（id、type、boundingBox 等）；
   - IPropertyProvider（供属性系统读取/写入）。
3. 为每类实体补充运行时缓存与引用关系：
   - 例如：Footprint 持有 Pad 引用，Track/Via 持有 Net 引用。

## 3. PCB 工具系统

1. 实现基础工具：
   - 选择工具：点选 / 框选 Footprint/Pad/Track/Via/BoardOutline；
   - Footprint 放置工具：网格吸附、旋转/镜像预览；
   - Routing 工具：按当前层绘制 Track，支持 45°/90° 约束与吸附，放置 Via 切换层；
   - 板框编辑工具：使用多段线编辑 BoardOutline。
2. 每个工具实现：
   - 输入事件处理（鼠标/键盘）；
   - 命中检测与吸附逻辑；
   - `parseContextMenu`：根据当前上下文生成候选命令列表；
   - 与命令系统集成（生成 ICommand 实例）。

## 4. 历史记录命令（PCB 版）

1. 基于 HistoryManager 实现核心命令：
   - PlaceFootprintCommand / DeleteFootprintCommand；
   - RouteTrackCommand / DeleteTrackCommand；
   - PlaceViaCommand / DeleteViaCommand；
   - MoveEntitiesCommand / RotateEntitiesCommand / MirrorEntitiesCommand；
   - PropertyChangeCommand（通用属性修改）。
2. 为命令实现合理的 merge 策略（例如连续移动合并为一次）；
3. 与前端快捷键与 UI 按钮对齐命令命名与行为。

## 5. PCB 文件与行文本编解码

1. 在 FileCodec 中实现 PCB 文档级 encode/decode：
   - `.rbeditor` 顶层结构：Header + 设置 + LayerStack + 实体列表；
   - 实体包括：Footprints / Pads / Tracks / Vias / Nets / BoardOutline 等。
2. 实现行文本格式的编解码：
   - 一行一个实体记录（FOOTPRINT/TRACK/VIA/...）；
   - 提供 encodeLines(doc) / decodeLines(lines) 之类的 API。
3. 保证与 PCB 图元 JSON 模型文档中的字段一一对应。

## 6. Manager 层与空间索引

1. 实现泛型 EntityManager 基类：
   - getById / getAll / add / remove / update；
   - encodeLine / decodeLine 接口（与行文本格式耦合）。
2. 实现以下具体 Manager：
   - LayerManager / NetManager / NetClassManager；
   - FootprintManager / PadManager；
   - TrackManager / ViaManager / CopperAreaManager；
   - TextManager / DimensionManager。
3. 集成空间索引（QuadTree 等）：
   - 针对 Track/Via/Pad 支持拾取与框选加速；
   - 提供统一的查询接口（按区域、按点）。

## 7. 几何算法与命中/吸附

1. 按 [03-图形内核与算法-详细设计](../03-图形内核与算法-详细设计.md) 实现基础几何算法：
   - 相交 / 距离 / 点在多边形内判断；
   - 偏移 / 布尔运算（可按阶段实现子集）。
2. 在 [07-图形内核-几何算法库-详细设计](../07-图形内核-几何算法库-详细设计.md) 中定义的高级算法：
   - 三角剖分（triangulation）用作视图生成与后续 WebGL；
   - 为 DRC 与命中/吸附预留所需接口。
3. 将几何能力与工具系统整合：
   - 走线时的 45°/90° 约束；
   - 检查 Track 与板框关系（不出界）。

## 8. 与属性系统对接

1. 设计并实现 IPropertySchema / IEntitySchema / IPropertyProvider：
   - 支持实体属性的 Schema 定义；
   - 供前端动态表单渲染使用。
2. 为 Board/Layer/Footprint/Pad/Track/Via 等实体提供 Schema：
   - 对齐 product-architect 给出的属性暴露策略；
   - 区分必填与可选字段。

## 9. 技术文档与 QA 支持

1. 为关键模块补充技术说明：
   - 坐标系与视口设计；
   - 工具系统架构；
   - 文件与行文本编解码流程。
2. 与 qa-automation-expert 协调：
   - 提供命中/吸附、文件回环测试所需的测试钩子与调试输出。

