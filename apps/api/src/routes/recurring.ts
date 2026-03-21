import { Hono } from "hono";
import {
  isRecurringCadence,
  isRecurringSourceKind,
  normalizeCurrency,
  type CreateRecurringTemplateInput,
  type RecurringTemplateRecord,
  type RecurringTemplatesResponse,
} from "@hearth/shared";
import type { ApiEnv } from "../types";

export const recurringRoutes = new Hono<ApiEnv>();

recurringRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("recurring_templates")
    .select("id, user_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<RecurringTemplatesResponse>({
    items: (data ?? []) as RecurringTemplateRecord[],
    count: data?.length ?? 0,
    status: "ok",
  });
});

recurringRoutes.post("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  let payload: CreateRecurringTemplateInput;
  try {
    payload = await c.req.json<CreateRecurringTemplateInput>();
  } catch {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Invalid JSON body.",
        status: "error",
      },
      400,
    );
  }

  const name = payload.name?.trim();
  if (!name) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Recurring template name is required.",
        status: "error",
      },
      400,
    );
  }

  const cadence = payload.cadence ?? "monthly";
  if (!isRecurringCadence(cadence)) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Recurring cadence is invalid.",
        status: "error",
      },
      400,
    );
  }

  const sourceKind = payload.source_kind ?? "manual";
  if (!isRecurringSourceKind(sourceKind)) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Recurring source kind is invalid.",
        status: "error",
      },
      400,
    );
  }

  const amount =
    payload.amount === null || payload.amount === undefined ? null : Number(payload.amount);
  if (amount !== null && !Number.isFinite(amount)) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "amount must be a number when provided.",
        status: "error",
      },
      400,
    );
  }

  const anchorDay =
    payload.anchor_day === null || payload.anchor_day === undefined
      ? null
      : Number(payload.anchor_day);
  if (
    anchorDay !== null &&
    (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)
  ) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "anchor_day must be between 1 and 31 when provided.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("recurring_templates")
    .insert({
      user_id: user.id,
      name,
      category: payload.category?.trim() || null,
      amount,
      currency: normalizeCurrency(payload.currency),
      cadence,
      anchor_day: anchorDay,
      source_kind: sourceKind,
      source_section: payload.source_section?.trim() || null,
      notes: payload.notes?.trim() || null,
    })
    .select("id, user_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at")
    .single();

  if (error) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<RecurringTemplatesResponse>({
    items: [data as RecurringTemplateRecord],
    count: 1,
    status: "ok",
  });
});
