import * as pdfjsLib from "pdfjs-dist";
import {
  parseCathayPdfTransactions,
  parseCtbcPdfTransactions,
  parseEsunPdfTransactions,
  parseMegaPdfTransactions,
  parseSinopacPdfTransactions,
  parseTaishinPdfTransactions,
  type ParsedPdfTransaction,
} from "@hearth/shared";

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

    // Group items by y-coordinate to reconstruct line breaks.
    // Without this, all items on a page are joined into one long string
    // and the parser can only match the first transaction.
    const lineMap = new Map<number, string[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      // Round to nearest 3 pt to tolerate slight vertical misalignment
      const y = Math.round((item as { transform: number[] }).transform[5] / 3) * 3;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item.str);
    }

    // PDF y-axis: 0 at bottom, increasing upward → sort descending for top-to-bottom reading order
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(" ").trim())
      .filter(Boolean);

    pages.push(lines.join("\n"));
  }

  return pages.join("\n");
}

export type ParsedTransaction = ParsedPdfTransaction;

export function parseSinopacPdfText(text: string): ParsedTransaction[] {
  return parseSinopacPdfTransactions(text);
}

export function parseEsunPdfText(text: string): ParsedTransaction[] {
  return parseEsunPdfTransactions(text);
}

export function parseCathayPdfText(text: string): ParsedTransaction[] {
  return parseCathayPdfTransactions(text);
}

export function parseTaishinPdfText(text: string): ParsedTransaction[] {
  return parseTaishinPdfTransactions(text);
}

export function parseCtbcPdfText(text: string): ParsedTransaction[] {
  return parseCtbcPdfTransactions(text);
}

export function parseMegaPdfText(text: string): ParsedTransaction[] {
  return parseMegaPdfTransactions(text);
}
