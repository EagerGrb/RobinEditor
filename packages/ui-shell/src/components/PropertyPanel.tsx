import { Card, Form, Input, InputNumber, Switch, Typography } from "antd";
import { Topics, type EventBus } from "@render/event-bus";
import { useEffect, useMemo, useState } from "react";
import { type SelectionPayload } from "../types";

export type PropertyPanelProps = {
  bus: EventBus;
};

export function PropertyPanel({ bus }: PropertyPanelProps) {
  const [selection, setSelection] = useState<SelectionPayload>({ type: "none" });
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [form] = Form.useForm();

  useEffect(() => {
    return bus.subscribe(Topics.GRAPHICS_SELECTION_CHANGED, (payload) => {
      setSelection(payload);
    });
  }, [bus]);

  useEffect(() => {
    if ("id" in selection) {
      const nextMetadata = selection.metadata ?? {};
      setMetadata(nextMetadata);
      form.setFieldsValue({ id: selection.id, metadata: nextMetadata });
      return;
    }

    setMetadata({});
    form.resetFields();
  }, [selection, form]);

  useEffect(() => {
    return bus.subscribe(Topics.GRAPHICS_ENTITY_UPDATED, (payload) => {
      if (!("id" in selection) || payload.id !== selection.id) return;
      setMetadata(payload.metadata);
      form.setFieldsValue({ metadata: payload.metadata });
    });
  }, [bus, form, selection]);

  const header = useMemo(() => {
    if (!("id" in selection)) return "属性";
    return `属性 - ${selection.type} (${selection.id})`;
  }, [selection]);

  if (!("id" in selection)) {
    return (
      <div style={{ padding: 10 }}>
        <Card size="small" title={header}>
          <Typography.Text type="secondary">请选择一个对象</Typography.Text>
        </Card>
      </div>
    );
  }

  const onValuesChange = (changed: { metadata?: Record<string, unknown> }) => {
    const patch = changed.metadata;
    if (!patch || Object.keys(patch).length === 0) return;
    bus.publish(Topics.UI_OBJECT_PROPERTIES_CHANGED, { id: selection.id, patch });
  };

  const renderEditor = (value: unknown) => {
    if (typeof value === "number") return <InputNumber style={{ width: "100%" }} />;
    if (typeof value === "boolean") return <Switch />;
    if (value && typeof value === "object") return <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} />;
    return <Input />;
  };

  return (
    <div style={{ padding: 10, height: "100%", overflow: "auto" }}>
      <Card size="small" title={header}>
        <Form layout="vertical" form={form} onValuesChange={(changed) => onValuesChange(changed)}>
          <Form.Item label="ID" name="id">
             <Input disabled />
          </Form.Item>
          {Object.keys(metadata).map((k) => (
            <Form.Item
              key={k}
              label={k}
              name={["metadata", k]}
              valuePropName={typeof metadata[k] === "boolean" ? "checked" : "value"}
            >
              {renderEditor(metadata[k])}
            </Form.Item>
          ))}
        </Form>
      </Card>
    </div>
  );
}
