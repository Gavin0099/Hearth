import { Hono } from "hono";
import {
  isAccountType,
  normalizeCurrency,
  type AccountRecord,
  type CreateAccountInput,
} from "@hearth/shared";
import type { ApiEnv } from "../types";

type AccountsResponse =
  | {
      items: AccountRecord[];
      count: number;
      status: "ok";
    }
  | {
      code: "unauthorized" | "validation_error" | "database_error";
      error: string;
      status: "error";
    };

export const accountsRoutes = new Hono<ApiEnv>();

accountsRoutes.get("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<AccountsResponse>(
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
    .from("accounts")
    .select("id, user_id, name, type, currency, broker, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json<AccountsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<AccountsResponse>({
    items: (data ?? []) as AccountRecord[],
    count: data?.length ?? 0,
    status: "ok",
  });
});

accountsRoutes.post("/", async (c) => {
  const resolveAuthenticatedUser = c.get("resolveAuthenticatedUser");
  const user = await resolveAuthenticatedUser(c.req.raw, c.env);
  if (!user) {
    return c.json<AccountsResponse>(
      {
        code: "unauthorized",
        error: "Missing or invalid Supabase bearer token.",
        status: "error",
      },
      401,
    );
  }

  let payload: CreateAccountInput;
  try {
    payload = await c.req.json<CreateAccountInput>();
  } catch {
    return c.json<AccountsResponse>(
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
    return c.json<AccountsResponse>(
      {
        code: "validation_error",
        error: "Account name is required.",
        status: "error",
      },
      400,
    );
  }

  if (!isAccountType(payload.type)) {
    return c.json<AccountsResponse>(
      {
        code: "validation_error",
        error: "Account type is invalid.",
        status: "error",
      },
      400,
    );
  }

  const createSupabaseAdminClient = c.get("createSupabaseAdminClient");
  const supabase = createSupabaseAdminClient(c.env);
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name,
      type: payload.type,
      currency: normalizeCurrency(payload.currency),
      broker: payload.broker?.trim() || null,
    })
    .select("id, user_id, name, type, currency, broker, created_at")
    .single();

  if (error) {
    return c.json<AccountsResponse>(
      {
        code: "database_error",
        error: error.message,
        status: "error",
      },
      500,
    );
  }

  return c.json<AccountsResponse>({
    items: [data as AccountRecord],
    count: 1,
    status: "ok",
  });
});
