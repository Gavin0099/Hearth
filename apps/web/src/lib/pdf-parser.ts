import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import ocrCorePath from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import ocrWorkerPath from "tesseract.js/dist/worker.min.js?url";
import {
  parseCathayPdfTransactions,
  parseCtbcPdfTransactions,
  parseEsunBankPdfTransactions,
  parseEsunPdfTransactions,
  parseMegaPdfTransactions,
  parseSinopacBankPdfTransactions,
  parseSinopacPdfTransactions,
  parseTaishinPdfTransactions,
  parseSinopacLoanSection,
  parseSinopacInsuranceSection,
  type ParsedPdfTransaction,
} from "@hearth/shared";

export { parseSinopacLoanSection, parseSinopacInsuranceSection };

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const OCR_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";
const OCR_LANGS = ["eng", "chi_tra"];
const OCR_RENDER_SCALE = 3;
const CTBC_COVER_MARKERS = ["0800-024365", "0800-899-399", "7.7", "300,000", "i APP"];
const ESUN_COVER_MARKERS = ["綜合對帳單", "資料參考日", "對帳單期間", "客服中心專線", "本人致電客服中心", "循環信用利率", "預借現金手續費"];

export type PdfBankHint = "sinopac" | "esun" | "cathay" | "taishin" | "ctbc" | "mega";

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
  debug?: {
    ocrCandidates?: Array<{
      page: number;
      preview: string;
      score: number;
      tag: string;
    }>;
  };
  text: string;
  source: PdfTextExtractionSource;
};

const ROW_Y_TOLERANCE = 4.5;
let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof Tesseract.createWorker>>> | null = null;

type CropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type OcrCandidate = {
  canvas: HTMLCanvasElement;
  tag: string;
};

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

function buildHighContrastCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OCR fallback failed: unable to create preprocessing canvas context.");
  }

  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const grayscale = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
    const normalized = grayscale >= 180 ? 255 : grayscale <= 110 ? 0 : grayscale;
    data[i] = normalized;
    data[i + 1] = normalized;
    data[i + 2] = normalized;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function buildBinaryThresholdCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OCR fallback failed: unable to create threshold canvas context.");
  }

  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const grayscale = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
    const binary = grayscale >= 170 ? 255 : 0;
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, region: CropRegion) {
  const canvas = document.createElement("canvas");
  const sx = Math.max(0, Math.floor(source.width * region.left));
  const sy = Math.max(0, Math.floor(source.height * region.top));
  const sw = Math.min(source.width - sx, Math.ceil(source.width * region.width));
  const sh = Math.min(source.height - sy, Math.ceil(source.height * region.height));

  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OCR fallback failed: unable to create crop canvas context.");
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function scoreCtbcOcrText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return Number.NEGATIVE_INFINITY;

  const rocDateCount = (normalized.match(/\b1\d{2}\/\d{2}\/\d{2}\b/g) ?? []).length;
  const shortDateCount = (normalized.match(/\b\d{2}\/\d{2}\b/g) ?? []).length;
  const cardCount = (normalized.match(/\b\d{4}\b/g) ?? []).length;
  const amountCount = (normalized.match(/\b-?\d[\d,]*(?:\.\d+)?\b/g) ?? []).length;
  const feeCount = (normalized.match(/國外交易手續費/g) ?? []).length;
  const headerCount = (normalized.match(/消費日|入帳起息日|卡號末四碼|消費地|幣別|台幣金額|消費暨收費摘要表/g) ?? []).length;
  const merchantHints = (normalized.match(/7-ELEVEN|OPENAI|STEAM|APPLE|ATM|全家|超商|統一/g) ?? []).length;
  const coverPenalty = CTBC_COVER_MARKERS.filter((marker) => normalized.includes(marker)).length * 6;
  const transactionRowCount = (normalized.match(/(?:\b1\d{2}\/\d{2}\/\d{2}\b|\b\d{2}\/\d{2}\b).{0,80}?\b\d{4}\b/g) ?? []).length;

  return (
    (rocDateCount * 8) +
    (shortDateCount * 3) +
    (cardCount * 2) +
    amountCount +
    (feeCount * 5) +
    (headerCount * 4) +
    (merchantHints * 2) +
    (transactionRowCount * 9) -
    coverPenalty -
    Math.max(0, 8 - normalized.length / 40)
  );
}

function scoreEsunOcrText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return Number.NEGATIVE_INFINITY;

  const condensed = normalized.replace(/\s+/g, "");
  const fullDateCount = (normalized.match(/\b\d{4}\/\d{2}\/\d{2}\b/g) ?? []).length;
  const shortDateCount = (normalized.match(/\b\d{2}\/\d{2}\b/g) ?? []).length;
  const amountCount = (normalized.match(/\b-?\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g) ?? []).length;
  const detailHeaderCount = (condensed.match(/本期費用明細|本期消費明細|存款交易明細|交易明細|期初餘額|前期結餘|上期結餘/g) ?? []).length;
  const currencyCount = (normalized.match(/\bTWD\b|\bUSD\b|\bJPY\b|新臺幣|美元|日圓|日幣/g) ?? []).length;
  const transactionRowCount =
    (normalized.match(/\b\d{4}\/\d{2}\/\d{2}\b.{0,100}\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g) ?? []).length;
  const coverPenalty = ESUN_COVER_MARKERS.filter((marker) => condensed.includes(marker)).length * 8;

  return (
    (detailHeaderCount * 12) +
    (transactionRowCount * 10) +
    (fullDateCount * 4) +
    (shortDateCount * 2) +
    amountCount +
    (currencyCount * 3) -
    coverPenalty -
    Math.max(0, 10 - normalized.length / 50)
  );
}

function scoreOcrText(bank: PdfBankHint | undefined, text: string) {
  if (bank === "ctbc") return scoreCtbcOcrText(text);
  if (bank === "esun") return scoreEsunOcrText(text);
  return text.length;
}

function buildOcrCandidatesForBank(canvas: HTMLCanvasElement, bank?: PdfBankHint) {
  const candidates: OcrCandidate[] = [
    { canvas, tag: "full_raw" },
    { canvas: buildHighContrastCanvas(canvas), tag: "full_enhanced" },
    { canvas: buildBinaryThresholdCanvas(canvas), tag: "full_thresholded" },
  ];

  if (bank === "esun") {
    const esunRegions: CropRegion[] = [
      { left: 0.04, top: 0.20, width: 0.92, height: 0.74 },
      { left: 0.05, top: 0.28, width: 0.90, height: 0.62 },
      { left: 0.06, top: 0.36, width: 0.88, height: 0.52 },
      { left: 0.05, top: 0.46, width: 0.90, height: 0.42 },
    ];

    esunRegions.forEach((region, index) => {
      const cropped = cropCanvas(canvas, region);
      candidates.push({ canvas: cropped, tag: `esun_crop_${index + 1}` });
      candidates.push({ canvas: buildHighContrastCanvas(cropped), tag: `esun_crop_${index + 1}_enhanced` });
      candidates.push({ canvas: buildBinaryThresholdCanvas(cropped), tag: `esun_crop_${index + 1}_thresholded` });
    });

    return candidates;
  }

  if (bank !== "ctbc") {
    return candidates;
  }

  const ctbcRegions: CropRegion[] = [
    { left: 0.04, top: 0.18, width: 0.92, height: 0.76 },
    { left: 0.05, top: 0.24, width: 0.90, height: 0.68 },
    { left: 0.05, top: 0.30, width: 0.90, height: 0.58 },
    { left: 0.06, top: 0.36, width: 0.88, height: 0.52 },
    { left: 0.08, top: 0.42, width: 0.84, height: 0.46 },
  ];

  ctbcRegions.forEach((region, index) => {
    const cropped = cropCanvas(canvas, region);
    candidates.push({ canvas: cropped, tag: `ctbc_crop_${index + 1}` });
    candidates.push({ canvas: buildHighContrastCanvas(cropped), tag: `ctbc_crop_${index + 1}_enhanced` });
  });

  return candidates;
}

async function extractPageTextLayer(page: pdfjsLib.PDFPageProxy): Promise<string> {
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

  return lineBuckets
    .sort((a, b) => b.y - a.y)
    .map((bucket) => rebuildLine(bucket.parts))
    .filter(Boolean)
    .join("\n");
}

async function extractTextLayerFromPdf(pdf: pdfjsLib.PDFDocumentProxy) {
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    pages.push(await extractPageTextLayer(page));
  }

  return pages.join("\n").trim();
}

async function extractTextFromPdfByOcr(pdf: pdfjsLib.PDFDocumentProxy, bank?: PdfBankHint) {
  const worker = await getOcrWorker();
  const pageTexts: string[] = [];
  const debugCandidates: PdfTextExtractionResult["debug"] = {
    ocrCandidates: [],
  };

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const canvas = await renderPageToCanvas(page);
    const candidates = buildOcrCandidatesForBank(canvas, bank);
    const results = await Promise.all(
      candidates.map(async (candidate) => ({
        tag: candidate.tag,
        text: (await worker.recognize(candidate.canvas)).data.text.trim(),
      })),
    );

    const scoredResults = results
      .map((result) => ({
        ...result,
        score: scoreOcrText(bank, result.text),
      }))
      .filter((result) => result.text);

    const bestPageText = scoredResults
      .sort((left, right) => right.score - left.score || right.text.length - left.text.length)[0]
      ?.text ?? "";

    const topCandidates = scoredResults
      .slice()
      .sort((left, right) => right.score - left.score || right.text.length - left.text.length)
      .slice(0, 3)
      .map((result) => ({
        page: i,
        preview: result.text.replace(/\s+/g, " ").trim().slice(0, 160),
        score: result.score,
        tag: result.tag,
      }));
    debugCandidates.ocrCandidates?.push(...topCandidates);

    pageTexts.push(bestPageText);
  }

  return {
    debug: debugCandidates,
    text: pageTexts.filter(Boolean).join("\n").trim(),
  };
}

export async function extractPdfText(
  data: Uint8Array,
  password?: string,
  bank?: PdfBankHint,
): Promise<PdfTextExtractionResult> {
  const loadingTask = pdfjsLib.getDocument({
    data,
    password: password ?? "",
  });

  const pdf = await loadingTask.promise;

  // For CTBC / E.SUN image statements: process per page, skip cover pages when
  // they only contain summary/customer-service content, and prefer OCR on pages
  // that look like real transaction tables.
  if (bank === "ctbc" || bank === "esun") {
    const worker = await getOcrWorker();
    const pageTexts: string[] = [];
    const debugCandidates: PdfTextExtractionResult["debug"] = { ocrCandidates: [] };
    let usedOcr = false;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const layerText = await extractPageTextLayer(page);

      // Skip cover/marketing pages: has cover markers, no transaction-table header,
      // and zero rows that look like actual transactions (date + content + card-last-4).
      if (layerText) {
        if (bank === "ctbc" && CTBC_COVER_MARKERS.some((marker) => layerText.includes(marker))) {
          const hasTransactionHeader = /消費日|入帳起息日|消費暨收費摘要表|卡號末四碼/.test(layerText);
          const txRowCount = (layerText.match(/\b(?:\d{2}\/\d{2}|\d{3}\/\d{2}\/\d{2})\b[^\n]+\s\d{4}\b/gm) ?? []).length;
          if (!hasTransactionHeader && txRowCount === 0) {
            continue;
          }
        }

        if (bank === "esun" && ESUN_COVER_MARKERS.some((marker) => layerText.includes(marker))) {
          const condensed = layerText.replace(/\s+/g, "");
          const hasTransactionHeader = /本期費用明細|本期消費明細|存款交易明細|交易明細|期初餘額|前期結餘|上期結餘/.test(condensed);
          const txRowCount = (layerText.match(/\b\d{4}\/\d{2}\/\d{2}\b[^\n]+\d{1,3}(?:,\d{3})+/gm) ?? []).length;
          if (!hasTransactionHeader && txRowCount === 0) {
            continue;
          }
        }
      }

      // Use text layer if it has content
      if (layerText) {
        pageTexts.push(layerText);
        continue;
      }

      // No text layer — OCR this page
      usedOcr = true;
      const canvas = await renderPageToCanvas(page);
      const candidates = buildOcrCandidatesForBank(canvas, bank);
      const results = await Promise.all(
        candidates.map(async (candidate) => ({
          tag: candidate.tag,
          text: (await worker.recognize(candidate.canvas)).data.text.trim(),
        })),
      );
      const scoredResults = results
        .map((r) => ({ ...r, score: scoreOcrText(bank, r.text) }))
        .filter((r) => r.text);
      const best = scoredResults.sort((a, b) => b.score - a.score || b.text.length - a.text.length)[0];
      debugCandidates.ocrCandidates?.push(
        ...scoredResults.slice(0, 3).map((r) => ({
          page: i,
          preview: r.text.replace(/\s+/g, " ").trim().slice(0, 160),
          score: r.score,
          tag: r.tag,
        })),
      );
      if (best?.text) pageTexts.push(best.text);
    }

    const combined = pageTexts.filter(Boolean).join("\n").trim();
    // If we attempted OCR (page 2 is image-based), do NOT fall through to the generic
    // text-layer path — that would return the cover-page text we already skipped, making
    // the error misleading.  Instead return the OCR result (possibly empty) so the caller
    // sees accurate debug output and the right error message.
    if (combined || usedOcr) {
      return {
        attemptedOcr: usedOcr,
        debug: usedOcr ? debugCandidates : undefined,
        text: combined,
        source: combined ? (usedOcr ? "ocr_fallback" : "text_layer") : "empty",
      };
    }
  }

  const textLayerText = await extractTextLayerFromPdf(pdf);
  if (textLayerText) {
    return {
      attemptedOcr: false,
      text: textLayerText,
      source: "text_layer",
    };
  }

  const ocrResult = await extractTextFromPdfByOcr(pdf, bank);
  const ocrText = ocrResult.text;
  if (ocrText) {
    return {
      attemptedOcr: true,
      debug: ocrResult.debug,
      text: ocrText,
      source: "ocr_fallback",
    };
  }

  return {
    attemptedOcr: true,
    debug: ocrResult.debug,
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

export function parseSinopacBankPdfText(text: string): ParsedTransaction[] {
  return parseSinopacBankPdfTransactions(text);
}

export function parseEsunBankPdfText(text: string): ParsedTransaction[] {
  return parseEsunBankPdfTransactions(text);
}
