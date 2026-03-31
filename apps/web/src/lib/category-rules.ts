import type { TransactionRecord } from "@hearth/shared";
import { apiFetch } from "./api";

export type CategoryRuleScope = "bank" | "credit";
export type CategoryRuleDirection = "expense" | "income";

export type LearnedCategoryRule = {
  category: string;
  direction: CategoryRuleDirection;
  normalizedDescription: string;
  rawDescription: string;
  scope: CategoryRuleScope;
  updatedAt: string;
};

type ApiRuleRow = {
  id: string;
  scope: string;
  direction: string;
  normalized_description: string;
  raw_description: string;
  category: string;
  updated_at: string;
};

function toLearnedRule(row: ApiRuleRow): LearnedCategoryRule {
  return {
    category: row.category,
    direction: row.direction as CategoryRuleDirection,
    normalizedDescription: row.normalized_description,
    rawDescription: row.raw_description,
    scope: row.scope as CategoryRuleScope,
    updatedAt: row.updated_at,
  };
}

function normalizeText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u3000/g, " ")
    .replace(/[*＊]+/g, "#")
    .replace(/\d{2,}/g, "#")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRuleDescription(description: string | null | undefined) {
  if (!description) {
    return "";
  }

  return normalizeText(description);
}

export function getRuleDirection(amount: number): CategoryRuleDirection {
  return amount < 0 ? "expense" : "income";
}

export async function loadLearnedCategoryRules(): Promise<LearnedCategoryRule[]> {
  try {
    const res = await apiFetch("/api/categorization-rules");
    if (!res.ok) return [];
    const json = (await res.json()) as { items: ApiRuleRow[]; status: string };
    if (json.status !== "ok") return [];
    return json.items.map(toLearnedRule);
  } catch {
    return [];
  }
}

export async function rememberCategoryRule(
  existingRules: LearnedCategoryRule[],
  transaction: TransactionRecord,
  category: string,
  scope: CategoryRuleScope,
): Promise<LearnedCategoryRule[]> {
  const normalizedDescription = normalizeRuleDescription(transaction.description);
  if (!normalizedDescription) {
    return existingRules;
  }

  const direction = getRuleDirection(transaction.amount);

  try {
    const res = await apiFetch("/api/categorization-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope,
        direction,
        normalized_description: normalizedDescription,
        raw_description: transaction.description ?? "",
        category,
      }),
    });

    if (!res.ok) return existingRules;
  } catch {
    return existingRules;
  }

  const nextRule: LearnedCategoryRule = {
    category,
    direction,
    normalizedDescription,
    rawDescription: transaction.description ?? "",
    scope,
    updatedAt: new Date().toISOString(),
  };

  return [
    nextRule,
    ...existingRules.filter(
      (rule) =>
        !(
          rule.scope === nextRule.scope &&
          rule.direction === nextRule.direction &&
          rule.normalizedDescription === nextRule.normalizedDescription
        ),
    ),
  ];
}

export function findMatchingCategoryRule(
  transaction: TransactionRecord,
  rules: LearnedCategoryRule[],
  scope: CategoryRuleScope,
) {
  const normalizedDescription = normalizeRuleDescription(transaction.description);
  if (!normalizedDescription) {
    return null;
  }

  const direction = getRuleDirection(transaction.amount);
  return (
    rules.find(
      (rule) =>
        rule.scope === scope &&
        rule.direction === direction &&
        rule.normalizedDescription === normalizedDescription,
    ) ?? null
  );
}
