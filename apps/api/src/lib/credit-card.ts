import { transactionCategories, type CreateTransactionInput } from "@hearth/shared";
import { parseCsv } from "./csv";

type CreditCardRow = Record<string, string>;

const postingDateAliases = ["入帳起息日", "入帳日", "posted_date"];
const dateAliases = ["交易日期", "消費日", "date"];
const amountAliases = ["金額", "交易金額", "amount"];
const descriptionAliases = ["摘要", "特店名稱", "商店名稱", "說明", "description"];
const currencyAliases = ["幣別", "currency"];
const typeAliases = ["交易類型", "類型", "收支別", "type"];
const ignoredMarkerAliases = ["小計", "合計", "總計", "本期應繳", "應繳總額"];

function getValue(row: CreditCardRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function shouldIgnoreRow(row: CreditCardRow) {
  const values = Object.values(row).map((value) => String(value).trim());
  return values.some((value) =>
    ignoredMarkerAliases.some((marker) => value.includes(marker)),
  );
}

function inferCategory(description: string) {
  const normalized = description.trim();
  if (!normalized) {
    return null;
  }
  const lowered = normalized.toLowerCase();

  const matched = transactionCategories.find((category) =>
    category.keywords.some((keyword) => lowered.includes(keyword.toLowerCase())),
  );
  return matched?.label ?? "其他";
}

function normalizeAmount(rawAmount: string, rawType: string, description: string) {
  const cleaned = rawAmount.replace(/[,\s]/g, "").trim();
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return null;
  }

  const type = rawType.toLowerCase();
  const descriptionLower = description.toLowerCase();

  if (
    type.includes("退款") ||
    type.includes("退貨") ||
    type.includes("refund") ||
    type.includes("credit") ||
    descriptionLower.includes("退款")
  ) {
    return Math.abs(numeric);
  }

  if (
    type.includes("繳款") ||
    type.includes("payment") ||
    descriptionLower.includes("繳款")
  ) {
    return null;
  }

  return -Math.abs(numeric);
}

export function parseCreditCardTransactionsCsv(text: string, accountId: string) {
  const rows = parseCsv(text);
  const normalized: CreateTransactionInput[] = [];
  const errors: string[] = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const line = index + 2;
    if (shouldIgnoreRow(row)) {
      skipped += 1;
      return;
    }

    const date = getValue(row, postingDateAliases.concat(dateAliases)).replace(/\//g, "-");
    const description = getValue(row, descriptionAliases);
    const rawAmount = getValue(row, amountAliases);
    const rawCurrency = getValue(row, currencyAliases) || "TWD";
    const rawType = getValue(row, typeAliases);
    const amount = normalizeAmount(rawAmount, rawType, description);

    if (!date) {
      errors.push(`line ${line}: date is required`);
      return;
    }

    if (amount === null) {
      skipped += 1;
      return;
    }

    normalized.push({
      account_id: accountId,
      date,
      amount,
      currency: rawCurrency.toUpperCase(),
      category: inferCategory(description),
      description: description || null,
      source: "credit_card_tw",
    });
  });

  return {
    normalized,
    errors,
    skipped,
  };
}
