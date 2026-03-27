import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import ocrCorePath from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import ocrWorkerPath from "tesseract.js/dist/worker.min.js?url";
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

const OCR_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";
const OCR_LANGS = ["eng", "chi_tra"];
const OCR_RENDER_SCALE = 2;

type PositionedText = {
  text: string;
  x: number;
  width: number;
  y: number;
};

type LineBucket = {
  y: number;
  parts: PositionedText[];
};

export type PdfTextExtractionSource = "text_layer" | "ocr_fallback" | "empty";

export type PdfTextExtractionResult = {
  attemptedOcr: boolean;
  text: string;
  source: PdfTextExtractionSource;
};

const ROW_Y_TOLERANCE = 4.5;
let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof Tesseract.createWorker>>> | null = null;

function shouldJoinWithoutSpace(previous: PositionedText, current: PositionedText) {
  const previousEnd = previous.x + previous.width;
  const gap = current.x - previousEnd;

  if (gap <= 1.5) return true;
  if (/[/(:.-]$/.test(previous.text)) return true;
  if (/^[/):.,-]/.test(current.text)) return true;
  if (/\d$/.test(previous.text) && /^\/\d/.test(current.text)) return true;
  if (/\/$/.test(previous.text) && /^\d/.test(current.text)) return true;

  return false;
}

function rebuildLine(parts: PositionedText[]) {
  const ordered = [...parts].sort((a, b) => a.x - b.x);
  if (ordered.length === 0) return "";

  let line = ordered[0].text;
  for (let i = 1; i < ordered.length; i++) {
    line += shouldJoinWithoutSpace(ordered[i - 1], ordered[i]) ? ordered[i].text : ` ${ordered[i].text}`;
  }

  return line.trim();
}

function assignToLineBucket(buckets: LineBucket[], part: PositionedText) {
  let bestBucket: LineBucket | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const bucket of buckets) {
    const distance = Math.abs(bucket.y - part.y);
    if (distance <= ROW_Y_TOLERANCE && distance < bestDistance) {
      bestBucket = bucket;
      bestDistance = distance;
    }
  }

  if (!bestBucket) {
    buckets.push({
      y: part.y,
      parts: [part],
    });
    return;
  }

  bestBucket.parts.push(part);
  bestBucket.y =
    bestBucket.parts.reduce((sum, current) => sum + current.y, 0) / bestBucket.parts.length;
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker(OCR_LANGS, 1, {
      workerPath: ocrWorkerPath,
      corePath: ocrCorePath,
      langPath: OCR_LANG_PATH,
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      });
      return worker;
    });
  }

  return ocrWorkerPromise;
}

async function renderPageToCanvas(page: pdfjsLib.PDFPageProxy) {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OCR fallback failed: unable to create canvas context.");
  }

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;

  return canvas;
}

async function extractTextLayerFromPdf(pdf: pdfjsLib.PDFDocumentProxy) {
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const lineBuckets: LineBucket[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const positioned = item as { str: string; transform: number[]; width?: number };
      assignToLineBucket(lineBuckets, {
        text: positioned.str,
        x: positioned.transform[4],
        width: positioned.width ?? 0,
        y: positioned.transform[5],
      });
    }

    const lines = lineBuckets
      .sort((a, b) => b.y - a.y)
      .map((bucket) => rebuildLine(bucket.parts))
      .filter(Boolean);

    pages.push(lines.join("\n"));
  }

  return pages.join("\n").trim();
}

async function extractTextFromPdfByOcr(pdf: pdfjsLib.PDFDocumentProxy) {
  const worker = await getOcrWorker();
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const canvas = await renderPageToCanvas(page);
    const result = await worker.recognize(canvas);
    pageTexts.push(result.data.text.trim());
  }

  return pageTexts.filter(Boolean).join("\n").trim();
}

export async function extractPdfText(
  data: Uint8Array,
  password?: string,
): Promise<PdfTextExtractionResult> {
  const loadingTask = pdfjsLib.getDocument({
    data,
    password: password ?? "",
  });

  const pdf = await loadingTask.promise;
  const textLayerText = await extractTextLayerFromPdf(pdf);
  if (textLayerText) {
    return {
      attemptedOcr: false,
      text: textLayerText,
      source: "text_layer",
    };
  }

  const ocrText = await extractTextFromPdfByOcr(pdf);
  if (ocrText) {
    return {
      attemptedOcr: true,
      text: ocrText,
      source: "ocr_fallback",
    };
  }

  return {
    attemptedOcr: true,
    text: "",
    source: "empty",
  };
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
