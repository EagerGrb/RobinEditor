import { Card, Form, InputNumber, Select, Typography } from "antd";
import { Topics, type EventBus } from "@render/event-bus";
import { useEffect, useMemo, useState } from "react";
import { type SelectionPayload } from "../types";

export type PropertyPanelProps = {
  bus: EventBus;
};

export function PropertyPanel({ bus }: PropertyPanelProps) {
  const [selection, setSelection] = useState<SelectionPayload>({ type: "none" });
  const [form] = Form.useForm();

  useEffect(() => {
    return bus.subscribe(Topics.GRAPHICS_SELECTION_CHANGED, (payload) => {
      setSelection(payload);
      form.resetFields();
    });
  }, [bus, form]);

  const header = useMemo(() => {
    if (selection.type === "none") return "属性";
    return `属性 - ${selection.type} (${selection.id})`;
  }, [selection]);

  if (selection.type === "none") {
    return (
      <div style={{ padding: 10 }}>
        <Card size="small" title={header}>
          <Typography.Text type="secondary">请选择一个对象</Typography.Text>
        </Card>
      </div>
    );
  }

  const onValuesChange = (changed: Record<string, unknown>) => {
    bus.publish(Topics.UI_OBJECT_PROPERTIES_CHANGED, {
      id: selection.id,
      patch: changed
    });
  };

  return (
    <div style={{ padding: 10, height: "100%", overflow: "auto" }}>
      <Card size="small" title={header}>
        {selection.type === "wall" && (
          <Form layout="vertical" form={form} onValuesChange={(_, all) => onValuesChange(all)}>
            <Form.Item label="厚度" name="thickness">
              <InputNumber min={1} max={1000} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="高度" name="height">
              <InputNumber min={1} max={10000} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="材质标记" name="material">
              <Select
                options={[
                  { value: "default", label: "默认" },
                  { value: "concrete", label: "混凝土" },
                  { value: "brick", label: "砖" }
                ]}
              />
            </Form.Item>
          </Form>
        )}

        {selection.type === "opening" && (
          <Form layout="vertical" form={form} onValuesChange={(_, all) => onValuesChange(all)}>
            <Form.Item label="类型" name="openingType">
              <Select
                options={[
                  { value: "door", label: "门" },
                  { value: "window", label: "窗" }
                ]}
              />
            </Form.Item>
            <Form.Item label="宽度" name="width">
              <InputNumber min={1} max={10000} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="高度" name="height">
              <InputNumber min={1} max={10000} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="开启方向" name="swing">
              <Select
                options={[
                  { value: "left", label: "左" },
                  { value: "right", label: "右" }
                ]}
              />
            </Form.Item>
          </Form>
        )}

        {selection.type === "dimension" && (
          <Form layout="vertical" form={form} onValuesChange={(_, all) => onValuesChange(all)}>
            <Form.Item label="精度" name="precision">
              <InputNumber min={0} max={4} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="标注风格" name="style">
              <Select
                options={[
                  { value: "engineering", label: "工程" },
                  { value: "compact", label: "紧凑" }
                ]}
              />
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}

