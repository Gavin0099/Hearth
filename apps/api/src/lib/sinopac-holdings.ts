import * as XLSX from "xlsx";

export type SinopacHoldingRow = {
  ticker: string;
  name: string;
  total_shares: number;
  avg_cost: number;
  close_price: number; // 0 if not available
};

function parseNum(val: unknown): number | null {
  const s = String(val ?? "").replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function colIndex(headers: unknown[], names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => String(h ?? "").includes(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseSinopacHoldingsXlsx(buffer: ArrayBuffer): {
  rows: SinopacHoldingRow[];
  errors: string[];
} {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ["xlsx 沒有工作表"] };

  const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  // Find header row containing 商品 and 今餘
  const headerRowIndex = raw.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const joined = row.map((c) => String(c ?? "")).join("");
    return joined.includes("商品") && joined.includes("今餘");
  });

  if (headerRowIndex === -1) {
    return { rows: [], errors: ["找不到欄位標題列（需包含「商品」和「今餘」）"] };
  }

  const headers = raw[headerRowIndex] as unknown[];
  const categoryCol = colIndex(headers, ["類別"]);
  const productCol = colIndex(headers, ["商品"]);
  const currentPriceCol = colIndex(headers, ["現價"]);
  const currentQtyCol = colIndex(headers, ["今餘"]);
  const avgCostCol = colIndex(headers, ["成本"]);

  if (productCol === -1 || currentQtyCol === -1 || avgCostCol === -1) {
    return { rows: [], errors: ["缺少必要欄位：商品、今餘、成本"] };
  }

  const rows: SinopacHoldingRow[] = [];
  const errors: string[] = [];

  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row.length === 0) continue;

    const category = String(row[categoryCol] ?? "").trim();
    const product = String(row[productCol] ?? "").trim();

    // Skip total row (合計) and empty rows
    if (!product || product === "合計" || category === "合計" || !category) continue;

    // "0050 元大台灣50" → ticker="0050", name="元大台灣50"
    const spaceIdx = product.indexOf(" ");
    const ticker = spaceIdx > 0 ? product.slice(0, spaceIdx).trim() : product;
    const name = spaceIdx > 0 ? product.slice(spaceIdx + 1).trim() : "";

    const total_shares = parseNum(row[currentQtyCol]);
    const avg_cost = parseNum(row[avgCostCol]);
    const close_price = currentPriceCol !== -1 ? parseNum(row[currentPriceCol]) : null;

    if (total_shares === null || avg_cost === null) {
      errors.push(`第 ${i + 1} 列 ${product}：數量或成本無效`);
      continue;
    }

    if (total_shares === 0) continue; // No current holding

    rows.push({ ticker, name, total_shares, avg_cost, close_price: close_price ?? 0 });
  }

  return { rows, errors };
}
