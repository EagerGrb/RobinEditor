import { Button, Typography } from "antd";
import { Topics, type EventBus } from "@render/event-bus";
import { useEffect, useMemo, useRef, useState } from "react";

export type LogPanelProps = {
  bus: EventBus;
};

type LogEntry = {
  id: string;
  time: number;
  topic: string;
  payload: unknown;
};

export function LogPanel({ bus }: LogPanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const maxLogs = 200;

  const visibleLogs = useMemo(() => (collapsed ? [] : logs), [collapsed, logs]);

  useEffect(() => {
    return bus.subscribe(Topics.LOG_EVENT, (payload) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: Date.now(),
        topic: payload.topic,
        payload: payload.payload
      };

      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length <= maxLogs) return next;
        return next.slice(next.length - maxLogs);
      });
    });
  }, [bus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleLogs]);

  return (
    <div style={{ height: collapsed ? 28 : 200, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px"
        }}
      >
        <Typography.Text style={{ color: "rgba(255,255,255,0.65)" }}>
          日志
        </Typography.Text>
        <Button size="small" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "展开" : "收起"}
        </Button>
      </div>

      {!collapsed && (
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflow: "auto",
            padding: "8px 10px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)"
          }}
        >
          {visibleLogs.map((log) => (
            <div key={log.id} style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>
              <div>
                [{new Date(log.time).toLocaleTimeString()}] {log.topic}
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)" }}>
                {safeStringify(log.payload)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
