# Rendering Core Expert (RE) 任务包 - 阶段二

## 任务概览
负责底层渲染引擎接口实现与视图层桥接。

## 任务清单

### [TASK-RE-2-01] Basic Primitives Rendering
*   **目标**: 实现纯几何图元的绘制。
*   **输入**: [03-图形内核与算法-详细设计.md](../阶段二-新架构设计/03-图形内核与算法-详细设计.md)
*   **内容**:
    *   实现 Canvas 2D 的 `drawLine`, `drawPolygon`, `drawText`。
    *   优化绘制性能（Batch Drawing）。

### [TASK-RE-2-02] Model-View Binding
*   **目标**: 协助 GE 实现视图更新。
*   **内容**:
    *   定义 `IRenderer` 接口。
    *   处理 Canvas 坐标系与 World 坐标系的变换 (Camera)。
