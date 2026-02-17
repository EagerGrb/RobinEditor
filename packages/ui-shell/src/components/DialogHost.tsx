import { Button, Input, Modal } from "antd";
import { Topics, type DialogRequestPayload, type EventBus } from "@render/event-bus";
import { useEffect, useMemo, useState } from "react";

export type DialogHostProps = {
  bus: EventBus;
};

export function DialogHost({ bus }: DialogHostProps) {
  const [active, setActive] = useState<DialogRequestPayload | null>(null);
  const [promptValue, setPromptValue] = useState<string>("");

  useEffect(() => {
    return bus.subscribe(Topics.DIALOG_REQUEST, (payload) => {
      setPromptValue("");
      setActive(payload);
    });
  }, [bus]);

  const open = !!active;
  const title = active?.title ?? "";

  const content = useMemo(() => {
    if (!active) return null;
    if (active.type === "PROMPT") {
      return (
        <Input
          autoFocus
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
        />
      );
    }
    if (typeof active.content === "string") return active.content;
    if (active.component) {
      return (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {JSON.stringify({ component: active.component, props: active.props ?? {} }, null, 2)}
        </pre>
      );
    }
    return null;
  }, [active, promptValue]);

  const close = () => setActive(null);

  const onOk = () => {
    const current = active;
    close();
    if (!current) return;
    if (current.type === "PROMPT") current.onConfirm?.(promptValue);
    else current.onConfirm?.(undefined);
  };

  const onCancel = () => {
    const current = active;
    close();
    current?.onCancel?.();
  };

  const showCancel = active?.type !== "ALERT";

  return (
    <Modal
      open={open}
      title={title}
      onOk={onOk}
      onCancel={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {showCancel && <Button onClick={onCancel}>取消</Button>}
          <Button type="primary" onClick={onOk}>
            确定
          </Button>
        </div>
      }
    >
      {content}
    </Modal>
  );
}
