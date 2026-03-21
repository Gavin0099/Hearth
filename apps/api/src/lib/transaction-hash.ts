import { createHash } from "node:crypto";
import type { CreateTransactionInput } from "@hearth/shared";

export function buildTransactionSourceHash(input: CreateTransactionInput) {
  return createHash("sha256")
    .update(
      [
        input.account_id.trim(),
        input.date.trim(),
        String(input.amount),
        (input.currency ?? "TWD").trim().toUpperCase(),
        (input.description ?? "").trim(),
        (input.category ?? "").trim(),
        (input.source ?? "").trim(),
      ].join("|"),
      "utf8",
    )
    .digest("hex");
}
