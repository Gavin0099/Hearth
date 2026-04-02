declare module "tesseract.js" {
  export type Worker = {
    setParameters(parameters: Record<string, string | number>): Promise<void>;
    recognize(
      image: ImageBitmapSource | OffscreenCanvas | HTMLCanvasElement | string,
    ): Promise<{ data: { text: string } }>;
    terminate(): Promise<void>;
  };

  export const PSM: {
    SPARSE_TEXT: number;
  };

  export function createWorker(
    langs?: string | string[],
    oem?: number,
    options?: {
      workerPath?: string;
      corePath?: string;
      langPath?: string;
      logger?: (message: unknown) => void;
    },
  ): Promise<Worker>;

  const Tesseract: {
    createWorker: typeof createWorker;
    PSM: typeof PSM;
  };

  export default Tesseract;
}
