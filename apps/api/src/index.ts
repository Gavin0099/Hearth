import { createApp } from "./app";
import { runDailyUpdate } from "./cron/daily-update";
import type { WorkerBindings } from "./types";

const app = createApp();
const fetchHandler = app.fetch.bind(app);

export const scheduled: ExportedHandlerScheduledHandler<WorkerBindings> = async (
  _controller: ScheduledController,
  env: WorkerBindings,
  ctx: ExecutionContext,
): Promise<void> => {
  ctx.waitUntil(runDailyUpdate(env));
};

export default {
  fetch: fetchHandler,
  scheduled,
} satisfies ExportedHandler<WorkerBindings>;
