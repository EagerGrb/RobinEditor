import { Topics, createEventBus, createEventLoggerMiddleware } from "@render/event-bus";

export const bus = createEventBus({
  middlewares: [
    createEventLoggerMiddleware({
      ignoreTopics: [
        Topics.LOG_EVENT,
        Topics.INPUT_MOUSE_MOVE,
        Topics.INPUT_WHEEL,
        Topics.INPUT_CANVAS_RESIZED
      ],
      logTopic: Topics.LOG_EVENT
    })
  ]
});
