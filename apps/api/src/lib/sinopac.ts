import { transactionCategories, type CreateTransactionInput } from "@hearth/shared";
import { parseCsv } from "./csv";

type SinopacRow = Record<string, string>;

const dateAliases = ["日期", "交易日期", "入帳日期", "date"];
const amountAliases = ["金額", "交易金額", "amount"];
const descriptionAliases = ["摘要", "說明", "備註", "description"];
const currencyAliases = ["幣別", "currency"];
const typeAliases = ["收支別", "方向", "type"];

function getValue(row: SinopacRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function inferCategory(description: string) {
  const normalized = description.trim();
  if (!normalized) {
    return null;
  }

  const matched = transactionCategories.find((category) =>
    category.keywords.some((keyword) => normalized.includes(keyword)),
  );
  return matched?.label ?? "其他";
}

function normalizeAmount(rawAmount: string, rawDirection: string) {
  const cleaned = rawAmount.replace(/,/g, "").trim();
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return null;
  }

  const direction = rawDirection.toLowerCase();
  if (
    direction.includes("支") ||
    direction.includes("debit") ||
    direction.includes("withdraw")
  ) {
    return -Math.abs(numeric);
  }

  if (
    direction.includes("收") ||
    direction.includes("credit") ||
    direction.includes("deposit")
  ) {
    return Math.abs(numeric);
  }

  return numeric;
}

export function parseSinopacTransactionsCsv(text: string, accountId: string) {
  const rows = parseCsv(text);
  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const date = getValue(row, dateAliases).replace(/\//g, "-");
    const description = getValue(row, descriptionAliases);
    const rawAmount = getValue(row, amountAliases);
    const rawCurrency = getValue(row, currencyAliases) || "TWD";
    const rawDirection = getValue(row, typeAliases);
    const amount = normalizeAmount(rawAmount, rawDirection);

    if (!date) {
      errors.push(`line ${line}: date is required`);
      return;
    }

    if (amount === null) {
      errors.push(`line ${line}: amount must be a non-zero number`);
      return;
    }

    normalized.push({
      account_id: accountId,
      date,
      amount,
      currency: rawCurrency.toUpperCase(),
      category: inferCategory(description),
      description: description || null,
      source: "sinopac_bank",
    });
  });

  return {
    normalized,
    errors,
  };
}
