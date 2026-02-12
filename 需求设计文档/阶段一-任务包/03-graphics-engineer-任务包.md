# Graphics Engineer (GE) 任务包 - 阶段二

## 任务概览
负责核心数据模块、算法库及图形内核的逻辑实现。

## 任务清单

### [TASK-GE-2-01] File Format & IO
*   **目标**: 实现 .rbeditor 格式读写与导入导出。
*   **输入**: [02-核心数据与文件系统-详细设计.md](../阶段二-新架构设计/02-核心数据与文件系统-详细设计.md)
*   **内容**:
    *   定义 Scene JSON Schema。
    *   实现 JSON 序列化/反序列化。
    *   实现 DXF 导入解析器。

### [TASK-GE-2-02] History System
*   **目标**: 撤销重做系统。
*   **内容**:
    *   实现 `Command` 接口与基类。
    *   实现 `HistoryStack` 管理。
    *   封装核心操作（Move, Add, Delete）为 Command。

### [TASK-GE-2-03] Core Cache & Algorithm
*   **目标**: 性能优化与几何计算。
*   **内容**:
    *   实现 `QuadTree` 空间索引。
    *   集成几何算法库 (Intersection, Distance)。
    *   实现 `ViewGenerator`，将 Model 转换为 Primitives。

### [TASK-GE-2-04] Design Rule Engine
*   **目标**: 设计规则校验。
*   **内容**:
    *   实现规则校验器接口。
    *   实现基础校验逻辑（重叠检测）。
