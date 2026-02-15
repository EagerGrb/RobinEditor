# PCB 图元与流式编码 —— 模型设计与任务分发（图形开发专家）

> 输入原料：`分析原料/PCB.epro2`（嘉立创 EDA Pro PCB 工程样本）
>
> 本文不尝试完全还原 `.epro2` 的内部细节，而是以其为参考样本，设计**我们自己的** PCB 文档结构、图元 JSON 模型以及行文本（流式）编码方案，服务于自有 `.rbeditor` 与调试用文本格式。

## 1. 目标与范围

- 在阶段一内，基于单板 PCB 编辑器的需求，完成：
  1. 将 PCB 数据拆分为一组清晰的**图元实体（Entities）**：Board、Layer、Net、Footprint、Pad、Track、Via、CopperArea、Text、Dimension 等；
  2. 为每类图元定义**最终 JSON 数据格式**（便于 `.rbeditor` 内嵌存储、前后端传输、调试）；
  3. 设计对应的 **Model 层**（TypeScript 接口/类），与已有 `IPropertyProvider`、`Entity` 体系对齐；
  4. 设计用于组织和操作这些 Model 的 **Controller 层**（文档控制器、路由控制器等）；
  5. 为每一类图元定义对应的 **Manager 层**，负责集合管理、索引与流式编解码对接；
  6. 设计并实现基于**流式（一行一记录）**的编码/解码格式，支持：
     - 文本文件：一行代表一个图元或层级记录；
     - 流式解析与输出（无须一次性加载整个文件即可遍历记录）。

- 角色指派：本任务面向 **图形开发专家（graphics-engineer）**，需与产品架构师、前端架构和渲染专家配合落地。

## 2. 图元拆分（Entities / Primitives）

结合 `EDA-阶段一-需求与任务分发.md`，阶段一需要覆盖的 PCB 图元实体包括：

1. **文档与板级结构**
   - `PcbDocument`：PCB 文档根对象，包含一个 Board（阶段一限定单板）。
   - `Board`：单块 PCB 板的抽象，聚合板框（BoardOutline）、层堆栈（LayerStack）与所有电气/辅助对象。
   - `BoardOutline`：板框轮廓，多边形；可由线段/圆弧构成。

2. **层堆栈与网络**
   - `LayerStack`：层堆栈配置（顺序、类型、名称、颜色等）。
   - `Layer`：单个层定义（如 TopLayer、BottomLayer、TopSilk、Mechanical 等）。
   - `Net`：网络定义（如 GND、VCC 等）。
   - `NetClass`：网络类（线宽/间距/层规则合集）。

3. **封装与焊盘**
   - `FootprintInstance`：封装实例（元件），带位置/角度/层信息，包含若干 Pad。
   - `Pad`：焊盘，附属于 Footprint 或为独立焊盘；包含形状、尺寸、孔径、所属层与 Net 等属性。

4. **走线与过孔**
   - `TrackSegment`：走线路径中的一段线（可以是折线片段，内部用点列表示）。
   - `Via`：过孔，连接多个层；包含孔径、外径、连接层列表等属性。

5. **覆铜与区域（阶段一可骨架化）**
   - `CopperArea`：覆铜区域，多边形，可带 Net 关联、膨胀/收缩参数。

6. **标注与文本**
   - `Dimension`：尺寸标注（长度、角度等）。
   - `Text`：文本/丝印内容，可附着在特定层（如丝印层）。

后续可以扩展的图元（阶段一非必需）：Keepout、MechanicalHole、DrillGuide 等。

## 3. JSON 数据格式设计

### 3.1 顶层文档结构

顶层 JSON 结构用于 `.rbeditor` 内部存储和前后端传输。

```ts
interface PcbDocumentJSON {
  header: {
    id: string;               // 文档 ID
    title: string;            // 文档名称
    version: string;          // 文档版本号
    createdAt: number;
    updatedAt: number;
  };
  settings: {
    unit: 'mm' | 'mil';       // 全局单位
    origin: { x: number; y: number }; // 原点
    grid: {
      spacing: number;        // 网格间距
      enabled: boolean;
    };
  };
  board: BoardJSON;
}

interface BoardJSON {
  id: string;
  outline: BoardOutlineJSON;
  layerStack: LayerStackJSON;
  nets: NetJSON[];
  netClasses: NetClassJSON[];
  footprints: FootprintJSON[];
  pads: PadJSON[];           // 散落焊盘（无 Footprint 附属）
  tracks: TrackJSON[];
  vias: ViaJSON[];
  copperAreas: CopperAreaJSON[];
  dimensions: DimensionJSON[];
  texts: TextJSON[];
}
```

### 3.2 层堆栈与网络

```ts
interface LayerStackJSON {
  id: string;
  layers: LayerJSON[];
}

type LayerType =
  | 'signal'
  | 'plane'
  | 'silk'
  | 'solderMask'
  | 'mechanical';

interface LayerJSON {
  id: string;          // 唯一 ID
  name: string;        // 显示名，例如 "TopLayer"
  type: LayerType;
  order: number;       // 在堆栈中的顺序（0 = 最上层）
  visible: boolean;
  locked: boolean;
  color: string;       // 十六进制颜色，例如 "#FF0000"
}

interface NetJSON {
  id: string;
  name: string;        // 如 "GND"
  netClassId?: string; // 所属网络类 ID
}

interface NetClassJSON {
  id: string;
  name: string;
  width: number;       // 默认线宽
  clearance: number;   // 默认间距
  viaDrill?: number;
  viaDiameter?: number;
}
```

### 3.3 板框与几何轮廓

```ts
interface BoardOutlineJSON {
  id: string;
  shape: PolygonJSON;  // 使用 04/07 文档定义的 Polygon/Polyline 数据结构
}

interface PolygonJSON {
  exterior: PolylineJSON;
  holes: PolylineJSON[];
}

interface PolylineJSON {
  closed: boolean;
  points: { x: number; y: number; bulge?: number }[]; // bulge 用于圆弧
}
```

### 3.4 Footprint 与 Pad

```ts
interface FootprintJSON {
  id: string;
  ref: string;              // 例如 "U1"
  name: string;             // 封装名，例如 "SOIC-8"
  libraryId?: string;       // 对应库 ID（可选）
  position: { x: number; y: number };
  rotation: number;         // 角度，单位度
  side: 'top' | 'bottom';   // 顶层/底层
  locked: boolean;
  layerId: string;          // 丝印或装配图所在层
  padIds: string[];         // 关联的 Pad ID 列表
}

type PadShape = 'circle' | 'rect' | 'oval' | 'roundedRect';

interface PadJSON {
  id: string;
  parentFootprintId?: string; // 所属 Footprint，独立焊盘则为空
  padNum?: string;            // 引脚编号，如 "1"、"A1"
  shape: PadShape;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation: number;
  drill?: {                  // 通孔信息（SMT 焊盘则为空）
    diameter: number;
    offset?: { x: number; y: number };
  };
  layers: string[];          // 关联层 ID 列表（如顶层焊盘、过孔焊盘）
  netId?: string;            // 所属 Net
  type: 'through' | 'smt' | 'npth';
}
```

### 3.5 Track、Via 与 CopperArea

```ts
interface TrackJSON {
  id: string;
  netId?: string;
  layerId: string;
  width: number;
  points: { x: number; y: number }[]; // 多点折线
}

interface ViaJSON {
  id: string;
  netId?: string;
  position: { x: number; y: number };
  drill: number;
  diameter: number;
  layers: string[]; // 连接的层 ID 列表，如 ["L1","L2"]
}

interface CopperAreaJSON {
  id: string;
  netId?: string;
  layerId: string;
  shape: PolygonJSON;
  clearance: number;      // 与其他对象的间距
  thermals: boolean;      // 热焊盘
}
```

### 3.6 文本与标注

```ts
interface TextJSON {
  id: string;
  layerId: string;
  value: string;
  position: { x: number; y: number };
  rotation: number;
  fontSize: number;
}

interface DimensionJSON {
  id: string;
  layerId: string;
  kind: 'linear' | 'horizontal' | 'vertical';
  start: { x: number; y: number };
  end: { x: number; y: number };
  offset: number;      // 标注线偏移距离
  text?: string;       // 自定义文本
}
```

## 4. Model 设计（内存结构）

### 4.1 实体基类与接口

在现有架构中，所有实体应继承自统一的 `Entity` 基类，并实现 `IPropertyProvider` 以支撑属性面板：

```ts
interface IEntity {
  id: string;
  type: string; // 'LAYER' | 'NET' | 'FOOTPRINT' | 'PAD' | 'TRACK' | 'VIA' | ...
}

interface IPropertyProvider {
  getSchema(): IEntitySchema;
  getProperty(key: string): any;
  setProperty(key: string, value: any): boolean;
}
```

各具体实体 Model（例如 `Layer`, `Net`, `Footprint`, `Pad`, `Track`, `Via` 等）需要：

- 与对应 JSON 结构一一映射；
- 额外提供：
  - 运行时缓存字段（如 boundingBox、选中状态等）；
  - 引用关系（如 Footprint 持有 Pad 引用，Track/Via 持有 Net 引用）。

### 4.2 文档控制 Model

```ts
class PcbDocumentModel {
  header: HeaderModel;
  settings: SettingsModel;
  board: BoardModel;
}

class BoardModel {
  outline: BoardOutlineModel;
  layerStack: LayerStackModel;
  nets: Map<string, NetModel>;
  netClasses: Map<string, NetClassModel>;
  footprints: Map<string, FootprintModel>;
  pads: Map<string, PadModel>;
  tracks: Map<string, TrackModel>;
  vias: Map<string, ViaModel>;
  copperAreas: Map<string, CopperAreaModel>;
  dimensions: Map<string, DimensionModel>;
  texts: Map<string, TextModel>;
}
```

`BoardModel` 不直接负责复杂操作，而是由后面的 Manager 与 Controller 负责具体的增删改逻辑。

## 5. Controller 设计

Controller 负责将命令与 UI 操作翻译为对 Model 和 Manager 的调用，提供更高层次的业务操作。

建议在阶段一定义如下几个核心 Controller：

1. **PcbDocumentController**
   - 职责：
     - 负责整体文档加载/保存（调用 Codec 完成 JSON <-> Model <-> 行文本）；
     - 提供新增/删除实体的统一入口（创建 Footprint/Track/Via 等）。
   - 示例方法：
     - `loadFromJson(json: PcbDocumentJSON): PcbDocumentModel`;
     - `exportToJson(doc: PcbDocumentModel): PcbDocumentJSON`;
     - `addFootprint(payload: FootprintJSON): FootprintModel`;
     - `deleteEntities(ids: string[]): void`。

2. **RoutingController**
   - 职责：
     - 处理交互式布线过程中的几何计算与 Track/Via 生成；
     - 对接 Snap/DRC 等模块。
   - 示例方法：
     - `startRoute(netId: string, startPoint: Vec2, startLayerId: string)`;
     - `updateRoute(cursor: Vec2)`;
     - `commitRoute()`（生成 Track/Via 实体，通过 TrackManager/ViaManager 持久化）。

3. **SelectionController**
   - 职责：
     - 管理当前选中集（Footprint/Pad/Track/Via 等）；
     - 计算命中与框选结果（调用空间索引）。

4. **LayerController / NetController（可选）**
   - 封装层可见性、当前层切换、Net 重命名等操作。

所有 Controller 调用底层 Manager 来完成真正的数据变更，具体变更通过命令模式（ICommand + HistoryManager）记录。

## 6. Manager 设计（集合与索引）

Manager 负责某一类实体的集合管理、索引维护和流式编解码接口。建议采用统一的模式：

```ts
interface IEntityManager<T extends IEntity> {
  getById(id: string): T | undefined;
  getAll(): Iterable<T>;
  add(entity: T): void;
  remove(id: string): void;
  update(id: string, patch: Partial<T>): void;

  // 流式编码相关
  encodeLine(entity: T): string;
  decodeLine(line: string): T | null;
}
``;

阶段一建议实现的 Manager：

- `LayerManager`：维护所有 Layer；
- `NetManager` / `NetClassManager`；
- `FootprintManager`；
- `PadManager`；
- `TrackManager`；
- `ViaManager`；
- `CopperAreaManager`；
- `TextManager` / `DimensionManager`。

每个 Manager 需要：

- 内部维护 `Map<string, T>` 或 `LinkedHashMap<string, T>` 以保留插入顺序；
- 根据实体的空间特性，挂接到 `QuadTree` 或其他空间索引（尤其是 Track/Via/Pad）；
- 提供与行文本编码/解码的桥接方法（见下一节）。

## 7. 流式编码与解码设计（一行一记录）

### 7.1 总体格式

行文本文件作为调试友好的补充格式，每一行表示一个记录：文档/层/网络/实体等。建议采用以下通用形式：

```txt
RECORD_TYPE|key1=value1;key2=value2;...
```

- `RECORD_TYPE`：记录类型标识，例如：
  - `DOC`：文档级信息；
  - `LAYER`：层；
  - `NET`：网络；
  - `NETCLASS`：网络类；
  - `FOOTPRINT`：封装实例；
  - `PAD`：焊盘；
  - `TRACK`：走线段；
  - `VIA`：过孔；
  - `COPPER`：覆铜区域；
  - `TEXT`：文本；
  - `DIM`：标注。

- `key=value`：键值对，使用 `;` 分隔。特殊字段（如点列）约定特殊编码，例如 `pts=x1,y1|x2,y2|...`。

行结尾以 `\n` 结束，不包含多行 JSON。

### 7.2 各类型记录示例

1. 文档与设置

```txt
DOC|id=doc1;title=PCB Demo;unit=mm;origin=0,0;grid=1.0
```

2. 层堆栈与层

```txt
LAYER|id=L1;name=TopLayer;type=signal;order=0;visible=1;locked=0;color=#FF0000
LAYER|id=L2;name=BottomLayer;type=signal;order=1;visible=1;locked=0;color=#00FF00
```

3. 网络与网络类

```txt
NETCLASS|id=NC1;name=Default;width=0.2;clearance=0.2;viaDrill=0.3;viaDia=0.6
NET|id=N1;name=GND;netClassId=NC1
NET|id=N2;name=VCC;netClassId=NC1
```

4. Footprint 与 Pad

```txt
FOOTPRINT|id=F1;ref=U1;name=SOIC-8;lib=STD;pos=10.0,20.0;rot=90;side=top;locked=0;layer=L_silk_top
PAD|id=P1;parent=F1;num=1;type=smt;shape=rect;pos=9.5,18.0;size=1.0x1.8;rot=0;layers=L1;net=N1
PAD|id=P2;parent=F1;num=2;type=smt;shape=rect;pos=10.5,18.0;size=1.0x1.8;rot=0;layers=L1;net=N2
```

其中：

- `size=WxH` 使用 `"w x h"` 编码；
- `layers` 可支持逗号分隔多个层 ID。

5. Track 与 Via

```txt
TRACK|id=T1;net=N1;layer=L1;width=0.2;pts=10.0,22.0|15.0,22.0|15.0,25.0
VIA|id=V1;net=N1;pos=15.0,25.0;drill=0.3;dia=0.6;layers=L1,L2
```

6. CopperArea、Text 与 Dimension（示意）

```txt
COPPER|id=C1;net=N1;layer=L1;clearance=0.2;thermals=1;poly=0,0|50,0|50,30|0,30
TEXT|id=TX1;layer=L_silk_top;val="U1";pos=10.0,18.0;rot=0;font=1.2
DIM|id=D1;layer=L_mech;kind=linear;start=0,0;end=50,0;offset=3.0;text="50mm"
```

### 7.3 流式解码流程

解码过程应支持边读边建模：

1. 打开文本流，逐行读取；
2. 对每一行：
   - 去除空行与注释（可约定 `#` 开头为注释）；
   - 按 `|` 分割出 `RECORD_TYPE` 与键值串；
   - 将键值串按 `;` 分割为 token，再按 `=` 分割为键与值；
   - 根据 `RECORD_TYPE` 分派到对应 Manager 的 `decodeLine(line)`；
   - Manager 根据字段表构造对应的 Model 实例并加入集合。

解码器需要对异常情况保持鲁棒性：

- 忽略未知字段（便于未来扩展）；
- 对缺失关键字段的记录进行错误收集而非立即中断（返回错误列表）。

### 7.4 流式编码流程

编码时：

1. 由 `PcbDocumentController` 统一遍历文档结构；
2. 按顺序写出记录：
   - DOC
   - 所有 LAYER
   - NETCLASS / NET
   - FOOTPRINT / PAD
   - TRACK / VIA
   - COPPER / TEXT / DIM
3. 对每个实体调用对应 Manager 的 `encodeLine(entity)`，形成单行字符串；
4. 写入到输出流（文件或网络）。

## 8. 与现有文件系统模块的关系

- `.rbeditor` JSON：
  - 内部采用第 3 节的 JSON 结构作为主存储格式；
  - 可以在 JSON 中嵌入行文本作为附加调试数据（可选）。

- 行文本格式：
  - 主要用作：
    - 调试和人工编辑；
    - 与其他工具简单交互；
    - 日志/差异比较（类似 netlist diff）。
  - 编解码器应作为 `Import/Export` 模块中的一个策略（TextPCBCodec）。

## 9. 任务分发（图形开发专家）

负责人：**图形开发专家（graphics-engineer）**

阶段一需要完成的任务：

1. **图元 JSON 模型定义**
   - 在 `@graphics-kernel` 或等效包中，基于本文件第 3 节，定义：
     - `PcbDocumentJSON` / `BoardJSON` / `LayerJSON` / `NetJSON` / `FootprintJSON` / `PadJSON` / `TrackJSON` / `ViaJSON` / `CopperAreaJSON` / `TextJSON` / `DimensionJSON` 等 TS 类型；
   - 确保与 `02-核心数据与文件系统-详细设计.md` 中的 `.rbeditor` 顶层结构兼容。

2. **Model 层实现**
   - 为核心实体实现 Model 类或接口：
     - `PcbDocumentModel` / `BoardModel` / `LayerStackModel` / `LayerModel`；
     - `NetModel` / `NetClassModel`；
     - `FootprintModel` / `PadModel`；
     - `TrackModel` / `ViaModel` / `CopperAreaModel` / `TextModel` / `DimensionModel`；
   - 确保所有实体实现 `IEntity` 与 `IPropertyProvider`，与属性系统联通。

3. **Manager 层实现与索引接入**
   - 实现泛型 `EntityManager<T>` 基类以及：
     - `LayerManager` / `NetManager` / `NetClassManager`；
     - `FootprintManager` / `PadManager`；
     - `TrackManager` / `ViaManager` / `CopperAreaManager`；
   - 集成 `QuadTree` 等空间索引（至少在 Track/Via/Pad 上提供拾取/框选加速）。

4. **Controller 层设计与基础实现**
   - 实现 `PcbDocumentController`，负责：
     - JSON <-> Model 转换；
     - 与各 Manager 的生命周期管理；
     - 对外暴露文档级 API（创建/删除实体，批量操作等）。
   - 预留 `RoutingController` 接口，与布线工具联动（可先提供空实现或简化版本）。

5. **流式编解码实现（行文本格式）**
   - 在 `Import/Export` 模块中实现：
     - `encodeToLines(doc: PcbDocumentModel): AsyncIterable<string>`；
     - `decodeFromLines(lines: AsyncIterable<string>): PcbDocumentModel`；
   - 为每一类 Manager 实现 `encodeLine(entity)` 与 `decodeLine(line)`：
     - 按第 7 节约定的键值串格式；
     - 注意数值解析与单位转换（mm/mil）。

6. **基础测试与验证（与 QA 协作）**
   - 与 QA 专家协商，编写至少以下测试：
     - JSON -> Model -> JSON 回环测试；
     - Model -> Lines -> Model / JSON 回环测试；
     - 包含 Footprint/Pad/Track/Via/Net/Layer/BoardOutline 的典型场景样例。

完成以上任务后，前端架构可以基于这些 Model/Manager/Controller 与 UI 框架、属性面板、命令系统集成；渲染专家可依据 Track/Pad/Via/CopperArea 的几何字段直接生成绘制命令。

