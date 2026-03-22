import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export async function extractPdfText(
  data: Uint8Array,
  password?: string,
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data,
    password: password ?? "",
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n");
}

export type ParsedTransaction = {
  date: string;
  description: string;
  amount: number;
  currency: string;
};

export function parseSinopacPdfText(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // 永豐格式：日期通常為 MM/DD，金額後有幣別
  const lineRegex = /(\d{2}\/\d{2})\s+(.+?)\s+([\d,]+)\s*(TWD|USD|JPY)?/g;
  let match;
  while ((match = lineRegex.exec(text)) !== null) {
    const [, date, description, amountStr, currency = "TWD"] = match;
    const amount = -Math.abs(Number(amountStr.replace(/,/g, "")));
    if (!Number.isFinite(amount) || amount === 0) continue;
    const year = new Date().getFullYear();
    transactions.push({
      date: `${year}-${date.replace("/", "-")}`,
      description: description.trim(),
      amount,
      currency,
    });
  }
  return transactions;
}

export function parseEsunPdfText(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // 玉山格式：日期通常為 YYYY/MM/DD 或 MM/DD
  const lineRegex = /(\d{4}\/\d{2}\/\d{2}|\d{2}\/\d{2})\s+(.+?)\s+([\d,]+)\s*(TWD|USD|JPY|NTD)?/g;
  let match;
  while ((match = lineRegex.exec(text)) !== null) {
    const [, date, description, amountStr, currency = "TWD"] = match;
    const amount = -Math.abs(Number(amountStr.replace(/,/g, "")));
    if (!Number.isFinite(amount) || amount === 0) continue;
    let normalizedDate = date;
    if (date.length === 5) {
      normalizedDate = `${new Date().getFullYear()}-${date.replace("/", "-")}`;
    } else {
      normalizedDate = date.replace(/\//g, "-");
    }
    transactions.push({
      date: normalizedDate,
      description: description.trim(),
      amount,
      currency: currency === "NTD" ? "TWD" : currency,
    });
  }
  return transactions;
}
