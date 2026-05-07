import { createApp } from "./app";
import { runDailyUpdate } from "./cron/daily-update";
import { runGmailSync } from "./cron/gmail-sync";
import type { WorkerBindings } from "./types";

const app = createApp();
const fetchHandler = app.fetch.bind(app);

export const scheduled: ExportedHandlerScheduledHandler<WorkerBindings> = async (
  controller: ScheduledController,
  env: WorkerBindings,
  ctx: ExecutionContext,
): Promise<void> => {
  if (controller.cron === "0 2 5 * *") {
    ctx.waitUntil(runGmailSync(env));
  } else {
    ctx.waitUntil(runDailyUpdate(env));
  }
};

export default {
  fetch: fetchHandler,
  scheduled,
} satisfies ExportedHandler<WorkerBindings>;
