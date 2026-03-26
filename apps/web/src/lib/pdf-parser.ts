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

    const lineMap = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const positioned = item as { str: string; transform: number[] };
      const y = Math.round(positioned.transform[5] / 3) * 3;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({
        x: positioned.transform[4],
        text: positioned.str,
      });
    }

    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(" ")
          .trim(),
      )
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
