import { Card, Form, Input, Typography } from "antd";
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
    });
  }, [bus]);

  useEffect(() => {
    if (selection.type !== "none") {
      form.setFieldsValue({ id: selection.id });
    }
  }, [selection, form]);

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
        <Form layout="vertical" form={form} onValuesChange={(_, all) => onValuesChange(all)}>
          <Form.Item label="ID" name="id">
             <Input disabled />
          </Form.Item>
          {/* Generic properties can be added here later */}
        </Form>
      </Card>
    </div>
  );
}
