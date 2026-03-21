import { Hono } from "hono";
import type { ApiEnv } from "../types";

const createImportStub = (source: string) => ({
  source,
  imported: 0,
  skipped: 0,
  failed: 0,
  runtime: "cloudflare-worker",
  persistence: "supabase",
  status: "stub",
});

export const importRoutes = new Hono<ApiEnv>();

importRoutes.post("/sinopac-tw", (c) => c.json(createImportStub("sinopac-tw")));
importRoutes.post("/excel-monthly", (c) =>
  c.json(createImportStub("excel-monthly")),
);
