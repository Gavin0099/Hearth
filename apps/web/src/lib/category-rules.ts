import type { Session } from "@supabase/supabase-js";
import type { TransactionRecord } from "@hearth/shared";

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

function buildRuleStorageKey(session: Session | null) {
  const userId = session?.user?.id ?? "anonymous";
  return `hearth.categoryRules.${userId}.v1`;
}

export function loadLearnedCategoryRules(session: Session | null): LearnedCategoryRule[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(buildRuleStorageKey(session));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as LearnedCategoryRule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLearnedCategoryRules(session: Session | null, rules: LearnedCategoryRule[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(buildRuleStorageKey(session), JSON.stringify(rules));
}

export function rememberCategoryRule(
  session: Session | null,
  existingRules: LearnedCategoryRule[],
  transaction: TransactionRecord,
  category: string,
  scope: CategoryRuleScope,
) {
  const normalizedDescription = normalizeRuleDescription(transaction.description);
  if (!normalizedDescription) {
    return existingRules;
  }

  const direction = getRuleDirection(transaction.amount);
  const nextRule: LearnedCategoryRule = {
    category,
    direction,
    normalizedDescription,
    rawDescription: transaction.description ?? "",
    scope,
    updatedAt: new Date().toISOString(),
  };

  const nextRules = [
    nextRule,
    ...existingRules.filter((rule) =>
      !(
        rule.scope === nextRule.scope &&
        rule.direction === nextRule.direction &&
        rule.normalizedDescription === nextRule.normalizedDescription
      )),
  ].slice(0, 500);

  saveLearnedCategoryRules(session, nextRules);
  return nextRules;
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
  return rules.find((rule) =>
    rule.scope === scope &&
    rule.direction === direction &&
    rule.normalizedDescription === normalizedDescription,
  ) ?? null;
}
