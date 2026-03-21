import { Hono } from "hono";
import type {
  CreateTransactionInput,
  TransactionRecord,
  TransactionsQuery,
  TransactionsResponse,
} from "@hearth/shared";
import type { ApiEnv } from "../types";

export const transactionsRoutes = new Hono<ApiEnv>();

function isValidDateQuery(value: string | undefined) {
  if (!value) {
    return true;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

transactionsRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionsResponse>(
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
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<TransactionsResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = (accounts ?? []).map((account: { id: string }) => account.id);
  if (accountIds.length === 0) {
    return c.json<TransactionsResponse>({
      items: [],
      count: 0,
      status: "ok",
    });
  }

  const queryInput: TransactionsQuery = {
    account_id: c.req.query("account_id")?.trim() || undefined,
    category: c.req.query("category")?.trim() || undefined,
    date_from: c.req.query("date_from")?.trim() || undefined,
    date_to: c.req.query("date_to")?.trim() || undefined,
    q: c.req.query("q")?.trim() || undefined,
  };

  if (!isValidDateQuery(queryInput.date_from) || !isValidDateQuery(queryInput.date_to)) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "date_from/date_to must use YYYY-MM-DD format.",
        status: "error",
      },
      400,
    );
  }

  if (queryInput.account_id && !accountIds.includes(queryInput.account_id)) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  let query = supabase
    .from("transactions")
    .select("id, account_id, date, amount, currency, category, description, source, source_hash, created_at")
    .in("account_id", queryInput.account_id ? [queryInput.account_id] : accountIds);

  if (queryInput.category) {
    query = query.eq("category", queryInput.category);
  }
  if (queryInput.date_from) {
    query = query.gte("date", queryInput.date_from);
  }
  if (queryInput.date_to) {
    query = query.lte("date", queryInput.date_to);
  }
  if (queryInput.q) {
    query = query.ilike("description", `%${queryInput.q}%`);
  }

  const { data, error } = await query.order("date", { ascending: false });

  if (error) {
    return c.json<TransactionsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<TransactionsResponse>({
    items: (data ?? []) as TransactionRecord[],
    count: data?.length ?? 0,
    status: "ok",
  });
});

transactionsRoutes.post("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionsResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  let payload: CreateTransactionInput;
  try {
    payload = await c.req.json<CreateTransactionInput>();
  } catch {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "Invalid JSON body.",
        status: "error",
      },
      400,
    );
  }

  if (!payload.account_id?.trim()) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "account_id is required.",
        status: "error",
      },
      400,
    );
  }

  if (!payload.date?.trim()) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "date is required.",
        status: "error",
      },
      400,
    );
  }

  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) === 0) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "amount must be a non-zero number.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<TransactionsResponse>(
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
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "Selected account does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      account_id: payload.account_id,
      date: payload.date,
      amount: Number(payload.amount),
      currency: payload.currency?.trim().toUpperCase() || "TWD",
      category: payload.category?.trim() || null,
      description: payload.description?.trim() || null,
      source: payload.source?.trim() || "manual",
    })
    .select("id, account_id, date, amount, currency, category, description, source, source_hash, created_at")
    .single();

  if (error) {
    return c.json<TransactionsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<TransactionsResponse>({
    items: [data as TransactionRecord],
    count: 1,
    status: "ok",
  });
});

transactionsRoutes.delete("/:transactionId", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<TransactionsResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  const transactionId = c.req.param("transactionId")?.trim();
  if (!transactionId) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "transactionId is required.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data: ownedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  if (accountsError) {
    return c.json<TransactionsResponse>(
      {
        code: "database_error",
        error: accountsError.message,
        status: "error",
      },
      500,
    );
  }

  const accountIds = (ownedAccounts ?? []).map((account: { id: string }) => account.id);
  if (accountIds.length === 0) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "Transaction does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .in("account_id", accountIds)
    .select("id, account_id, date, amount, currency, category, description, source, source_hash, created_at");

  if (error) {
    return c.json<TransactionsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  if (!data || data.length === 0) {
    return c.json<TransactionsResponse>(
      {
        code: "validation_error",
        error: "Transaction does not belong to the current user.",
        status: "error",
      },
      400,
    );
  }

  return c.json<TransactionsResponse>({
    items: data as TransactionRecord[],
    count: data.length,
    status: "ok",
  });
});
