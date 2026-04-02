import { Hono } from "hono";
import {
  type ApplyRecurringTemplatesInput,
  type ApplyRecurringTemplatesResponse,
  type CreateRecurringTemplatesFromCandidatesInput,
  isRecurringCadence,
  isRecurringSourceKind,
  normalizeCurrency,
  type CreateRecurringTemplateInput,
  type RecurringTemplateRecord,
  type RecurringTemplatesResponse,
} from "@hearth/shared";
import { buildTransactionSourceHash } from "../lib/transaction-hash";
import type { ApiEnv } from "../types";

export const recurringRoutes = new Hono<ApiEnv>();

function normalizeCandidateKey(name: string, sourceSection: string | null) {
  return `${name.trim().toLowerCase()}::${(sourceSection ?? "").trim().toLowerCase()}`;
}

async function resolveOwnedAccountIds(
  userId: string,
  createSupabaseAdminClient: ApiEnv["Variables"]["createSupabaseAdminClient"],
  env: ApiEnv["Bindings"],
) {
  const supabase = createSupabaseAdminClient(env);
  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  return {
    supabase,
    ownedAccounts,
    accountsError,
  };
}

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
    .select("id, user_id, account_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at")
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

  if (!payload.account_id?.trim()) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "account_id is required.",
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
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    user.id,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (!accountIds.has(payload.account_id)) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const { data, error } = await supabase
    .from("recurring_templates")
    .insert({
      user_id: user.id,
      account_id: payload.account_id,
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
    .select("id, user_id, account_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at")
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

recurringRoutes.post("/from-import-candidates", async (c) => {
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

  let payload: CreateRecurringTemplatesFromCandidatesInput;
  try {
    payload = await c.req.json<CreateRecurringTemplatesFromCandidatesInput>();
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

  if (!payload.account_id?.trim()) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "account_id is required.",
        status: "error",
      },
      400,
    );
  }

  if (!Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "At least one recurring import candidate is required.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    user.id,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (!accountIds.has(payload.account_id)) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const { data: existingTemplates, error: existingError } = await supabase
    .from("recurring_templates")
    .select("name, source_section, account_id")
    .eq("user_id", user.id);

  if (existingError) {
    return c.json<RecurringTemplatesResponse>(
      {
        code: "database_error",
        error: existingError.message,
        status: "error",
      },
      500,
    );
  }

  const existingKeys = new Set(
    (existingTemplates ?? []).map(
      (item: { name: string; source_section: string | null; account_id: string }) =>
        `${item.account_id}::${normalizeCandidateKey(item.name, item.source_section)}`,
    ),
  );

  const rowsToInsert: Array<Record<string, unknown>> = [];
  let skipped = 0;

  payload.candidates.forEach((candidate) => {
    if (candidate.kind !== "recurring_sidebar") {
      skipped += 1;
      return;
    }

    const name = candidate.label?.trim() || candidate.section.trim();
    const sourceSection = candidate.section.trim() || null;

    if (!name) {
      skipped += 1;
      return;
    }

    const key = `${payload.account_id}::${normalizeCandidateKey(name, sourceSection)}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      return;
    }

    existingKeys.add(key);
    rowsToInsert.push({
      user_id: user.id,
      account_id: payload.account_id,
      name,
      category: sourceSection,
      amount: null,
      currency: "TWD",
      cadence: "monthly",
      anchor_day: null,
      source_kind: "excel_sidebar",
      source_section: sourceSection,
      notes: `Imported from Excel sheet: ${candidate.sheet}`,
    });
  });

  if (rowsToInsert.length === 0) {
    return c.json<RecurringTemplatesResponse>({
      items: [],
      count: 0,
      skipped,
      status: "ok",
    });
  }

  const { data, error } = await supabase
    .from("recurring_templates")
    .insert(rowsToInsert)
    .select("id, user_id, account_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at");

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
    skipped,
    status: "ok",
  });
});

recurringRoutes.post("/apply", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  let payload: ApplyRecurringTemplatesInput;
  try {
    payload = await c.req.json<ApplyRecurringTemplatesInput>();
  } catch {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "Invalid JSON body.",
        status: "error",
      },
      400,
    );
  }

  const year = Number(payload.year);
  const month = Number(payload.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "year is invalid.",
        status: "error",
      },
      400,
    );
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "validation_error",
        error: "month is invalid.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const { supabase, ownedAccounts, accountsError } = await resolveOwnedAccountIds(
    user.id,
    createSupabaseAdminClient,
    c.env,
  );

  if (accountsError) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = new Set((ownedAccounts ?? []).map((account: { id: string }) => account.id));
  if (accountIds.size === 0) {
    return c.json<ApplyRecurringTemplatesResponse>({
      items: [],
      count: 0,
      skipped: 0,
      status: "ok",
    });
  }

  const { data: templates, error: templatesError } = await supabase
    .from("recurring_templates")
    .select("id, user_id, account_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at")
    .eq("user_id", user.id);

  if (templatesError) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "database_error",
        error: templatesError.message,
        status: "error",
      },
      500,
    );
  }

  const applicableTemplates = (templates ?? []).filter(
    (template: RecurringTemplateRecord) =>
      accountIds.has(template.account_id) &&
      template.cadence === "monthly" &&
      template.amount !== null,
  ) as RecurringTemplateRecord[];

  if (applicableTemplates.length === 0) {
    return c.json<ApplyRecurringTemplatesResponse>({
      items: [],
      count: 0,
      skipped: 0,
      status: "ok",
    });
  }

  const candidateRows = applicableTemplates.map((template) => {
    const anchorDay =
      template.anchor_day && template.anchor_day >= 1 && template.anchor_day <= 31
        ? template.anchor_day
        : 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(anchorDay, daysInMonth);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const description = template.name;
    const source = "recurring_template";
    return {
      account_id: template.account_id,
      date,
      amount: Number(template.amount),
      currency: template.currency ?? "TWD",
      category: template.category ?? null,
      description,
      source,
      source_hash: buildTransactionSourceHash({
        account_id: template.account_id,
        date,
        amount: Number(template.amount),
        currency: template.currency ?? "TWD",
        category: template.category ?? null,
        description,
        source,
      }),
    };
  });

  const sourceHashes = candidateRows.map((row) => row.source_hash);
  const { data: existingTransactions, error: existingError } = await supabase
    .from("transactions")
    .select("source_hash")
    .in("source_hash", sourceHashes);

  if (existingError) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "database_error",
        error: existingError.message,
        status: "error",
      },
      500,
    );
  }

  const existingHashes = new Set(
    (existingTransactions ?? [])
      .map((item: { source_hash: string | null }) => item.source_hash)
      .filter(Boolean),
  );

  const freshRows = candidateRows.filter((row) => !existingHashes.has(row.source_hash));
  const skipped = candidateRows.length - freshRows.length;

  if (freshRows.length === 0) {
    return c.json<ApplyRecurringTemplatesResponse>({
      items: [],
      count: 0,
      skipped,
      status: "ok",
    });
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert(
      freshRows.map((row) => ({
        account_id: row.account_id,
        date: row.date,
        amount: row.amount,
        currency: row.currency,
        category: row.category,
        description: row.description,
        source: row.source,
        source_hash: row.source_hash,
      })),
    )
    .select("id, account_id, date, amount, currency, category, description, source, source_hash, created_at");

  if (error) {
    return c.json<ApplyRecurringTemplatesResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<ApplyRecurringTemplatesResponse>({
    items: data ?? [],
    count: data?.length ?? 0,
    skipped,
    status: "ok",
  });
});

recurringRoutes.put("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RecurringTemplatesResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  let payload: { name?: string; category?: string | null; amount?: number | null; anchor_day?: number | null };
  try {
    payload = await c.req.json();
  } catch {
    return c.json<RecurringTemplatesResponse>(
      { code: "validation_error", error: "Invalid JSON body.", status: "error" },
      400,
    );
  }

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) {
      return c.json<RecurringTemplatesResponse>(
        { code: "validation_error", error: "Recurring template name cannot be empty.", status: "error" },
        400,
      );
    }
    updates.name = name;
  }
  if (payload.category !== undefined) {
    updates.category = payload.category?.trim() || null;
  }
  if (payload.amount !== undefined) {
    const amount = payload.amount === null ? null : Number(payload.amount);
    if (amount !== null && !Number.isFinite(amount)) {
      return c.json<RecurringTemplatesResponse>(
        { code: "validation_error", error: "amount must be a number when provided.", status: "error" },
        400,
      );
    }
    updates.amount = amount;
  }
  if (payload.anchor_day !== undefined) {
    const anchorDay = payload.anchor_day === null ? null : Number(payload.anchor_day);
    if (anchorDay !== null && (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)) {
      return c.json<RecurringTemplatesResponse>(
        { code: "validation_error", error: "anchor_day must be between 1 and 31 when provided.", status: "error" },
        400,
      );
    }
    updates.anchor_day = anchorDay;
  }

  if (Object.keys(updates).length === 0) {
    return c.json<RecurringTemplatesResponse>(
      { code: "validation_error", error: "No fields to update.", status: "error" },
      400,
    );
  }

  const id = c.req.param("id");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("recurring_templates")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, user_id, account_id, name, category, amount, currency, cadence, anchor_day, source_kind, source_section, notes, created_at")
    .single();

  if (error) {
    return c.json<RecurringTemplatesResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  return c.json<RecurringTemplatesResponse>({ items: [data as RecurringTemplateRecord], count: 1, status: "ok" });
});

recurringRoutes.delete("/:id", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<RecurringTemplatesResponse>(
      { code: "unauthorized", error: "Missing or invalid Supabase bearer token.", status: "error" },
      401,
    );
  }

  const id = c.req.param("id");
  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { error } = await supabase
    .from("recurring_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return c.json<RecurringTemplatesResponse>(
      { code: "database_error", error: error.message, status: "error" },
      500,
    );
  }

  return c.json({ status: "ok" });
});
