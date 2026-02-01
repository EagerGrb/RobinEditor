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

export type EventBus = {
  subscribe<TTopic extends KnownTopic>(
    topic: TTopic,
    handler: EventBusHandler<TopicPayloadMap[TTopic]>,
  ): Unsubscribe;
  subscribe<TPayload>(topic: EventBusTopic, handler: EventBusHandler<TPayload>): Unsubscribe;

  unsubscribe<TTopic extends KnownTopic>(
    topic: TTopic,
    handler: EventBusHandler<TopicPayloadMap[TTopic]>,
  ): void;
  unsubscribe<TPayload>(topic: EventBusTopic, handler: EventBusHandler<TPayload>): void;

  publish<TTopic extends KnownTopic>(topic: TTopic, payload: TopicPayloadMap[TTopic]): void;
  publish<TPayload>(topic: EventBusTopic, payload: TPayload): void;
};

export function createEventBus(options?: { middlewares?: EventBusMiddleware[] }): EventBus {
  const handlersByTopic = new Map<EventBusTopic, Set<EventBusHandler>>();
  const middlewares = options?.middlewares ?? [];
  const bus = {} as EventBus;

  function subscribe<TTopic extends KnownTopic>(
    topic: TTopic,
    handler: EventBusHandler<TopicPayloadMap[TTopic]>,
  ): Unsubscribe;
  function subscribe<TPayload>(topic: EventBusTopic, handler: EventBusHandler<TPayload>): Unsubscribe;
  function subscribe(topic: EventBusTopic, handler: EventBusHandler<unknown>): Unsubscribe {
    const set = handlersByTopic.get(topic) ?? new Set<EventBusHandler>();
    set.add(handler as EventBusHandler);
    handlersByTopic.set(topic, set);

    return () => {
      const current = handlersByTopic.get(topic);
      if (!current) return;
      current.delete(handler as EventBusHandler);
      if (current.size === 0) handlersByTopic.delete(topic);
    };
  }

  function unsubscribe<TTopic extends KnownTopic>(
    topic: TTopic,
    handler: EventBusHandler<TopicPayloadMap[TTopic]>,
  ): void;
  function unsubscribe<TPayload>(topic: EventBusTopic, handler: EventBusHandler<TPayload>): void;
  function unsubscribe(topic: EventBusTopic, handler: EventBusHandler<unknown>): void {
    const set = handlersByTopic.get(topic);
    if (!set) return;
    set.delete(handler as EventBusHandler);
    if (set.size === 0) handlersByTopic.delete(topic);
  }

  function publish<TTopic extends KnownTopic>(topic: TTopic, payload: TopicPayloadMap[TTopic]): void;
  function publish<TPayload>(topic: EventBusTopic, payload: TPayload): void;
  function publish(topic: EventBusTopic, payload: unknown): void {
    const event = { topic, payload: payload as unknown };

    const dispatch = () => {
      const set = handlersByTopic.get(topic);
      if (!set) return;
      for (const handler of set) {
        handler(payload);
      }
    };

    if (middlewares.length === 0) {
      dispatch();
      return;
    }

    let index = -1;
    const run = (i: number) => {
      if (i <= index) return;
      index = i;
      const middleware = middlewares[i];
      if (!middleware) {
        dispatch();
        return;
      }
      middleware(event, () => run(i + 1), bus);
    };

    run(0);
  }

  bus.subscribe = subscribe;
  bus.unsubscribe = unsubscribe;
  bus.publish = publish;
  return bus;
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
