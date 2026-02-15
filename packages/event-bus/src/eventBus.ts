import type { KnownTopic, TopicPayloadMap } from "./payloads.js";

export type EventBusTopic = KnownTopic | (string & {});

export type EventBusHandler<TPayload = unknown> = (payload: TPayload) => void;

export type Unsubscribe = () => void;

export type EventBusMiddleware = (
  event: {
    topic: EventBusTopic;
    payload: unknown;
  },
  next: () => void,
  bus: EventBus,
) => void;

export interface RpcRequestPayload {
  requestId: string;
  args: any[];
}

export interface RpcResponsePayload<T = unknown> {
  requestId: string;
  result?: T;
  error?: string;
}

export class EventBus {
  private handlersByTopic = new Map<EventBusTopic, Set<EventBusHandler>>();
  private middlewares: EventBusMiddleware[] = [];

  constructor(options?: { middlewares?: EventBusMiddleware[] }) {
    this.middlewares = options?.middlewares ?? [];
  }

  rpcService(service: string, methods: Record<string, (...args: any[]) => any>): void {
    for (const [methodName, methodImpl] of Object.entries(methods)) {
      const requestTopic = `rpc:request:${service}:${methodName}`;

      this.subscribe(requestTopic, async (payload: any) => {
        const { requestId, args } = payload as { requestId: string; args: any[] };
        const responseTopic = `rpc:response:${service}:${methodName}:${requestId}`;

        try {
          const result = await methodImpl(...args);
          this.publish(responseTopic, { requestId, result });
        } catch (error: any) {
          this.publish(responseTopic, { requestId, error: error.message || String(error) });
        }
      });
    }
  }

  rpcCall<TResult = unknown>(service: string, method: string, ...args: any[]): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(2, 15);
      const requestTopic = `rpc:request:${service}:${method}`;
      const responseTopic = `rpc:response:${service}:${method}:${requestId}`;

      const unsubscribe = this.subscribe(responseTopic, (payload: any) => {
        const { result, error } = payload as { result: TResult; error?: string };

        unsubscribe();

        if (error) {
          reject(new Error(error));
        } else {
          resolve(result as TResult);
        }
      });

      this.publish(requestTopic, { requestId, args });
    });
  }

  subscribe<TTopic extends KnownTopic>(
    topic: TTopic,
    handler: EventBusHandler<TopicPayloadMap[TTopic]>,
  ): Unsubscribe;
  subscribe<TPayload>(topic: EventBusTopic, handler: EventBusHandler<TPayload>): Unsubscribe;
  subscribe(topic: EventBusTopic, handler: EventBusHandler<unknown>): Unsubscribe {
    const set = this.handlersByTopic.get(topic) ?? new Set<EventBusHandler>();
    set.add(handler as EventBusHandler);
    this.handlersByTopic.set(topic, set);

    return () => {
      this.unsubscribe(topic, handler);
    };
  }

  unsubscribe<TTopic extends KnownTopic>(
    topic: TTopic,
    handler: EventBusHandler<TopicPayloadMap[TTopic]>,
  ): void;
  unsubscribe<TPayload>(topic: EventBusTopic, handler: EventBusHandler<TPayload>): void;
  unsubscribe(topic: EventBusTopic, handler: EventBusHandler<unknown>): void {
    const set = this.handlersByTopic.get(topic);
    if (!set) return;
    set.delete(handler as EventBusHandler);
    if (set.size === 0) this.handlersByTopic.delete(topic);
  }

  publish<TTopic extends KnownTopic>(topic: TTopic, payload: TopicPayloadMap[TTopic]): void;
  publish<TPayload>(topic: EventBusTopic, payload: TPayload): void;
  publish(topic: EventBusTopic, payload: unknown): void {
    const event = { topic, payload: payload as unknown };

    const dispatch = () => {
      const set = this.handlersByTopic.get(topic);
      if (!set) return;
      for (const handler of set) {
        handler(payload);
      }
    };

    if (this.middlewares.length === 0) {
      dispatch();
      return;
    }

    let index = -1;
    const run = (i: number) => {
      if (i <= index) return;
      index = i;
      const middleware = this.middlewares[i];
      if (!middleware) {
        dispatch();
        return;
      }
      middleware(event, () => run(i + 1), this);
    };

    run(0);
  }

  destroy(): void {
    this.handlersByTopic.clear();
    this.middlewares = [];
  }
}

export function createEventBus(options?: { middlewares?: EventBusMiddleware[] }): EventBus {
  return new EventBus(options);
}

export function createEventLoggerMiddleware(options: {
  ignoreTopics?: EventBusTopic[];
  logTopic: EventBusTopic;
}): EventBusMiddleware {
  const ignore = new Set(options.ignoreTopics ?? []);

  return (event, next, bus) => {
    next();

    if (ignore.has(event.topic)) return;

    bus.publish(options.logTopic, { topic: event.topic, payload: event.payload });
  };
}
