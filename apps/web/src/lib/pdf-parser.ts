import * as pdfjsLib from "pdfjs-dist";
import {
  parseEsunPdfTransactions,
  parseSinopacPdfTransactions,
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
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
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
