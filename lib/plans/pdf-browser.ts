import type { PdfJs } from "./pdf.ts";

/** 브라우저용 pdf.js. 글자를 읽는 작업은 별도 worker에서 돌린다. */
export async function loadPdfjs(): Promise<PdfJs> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs as unknown as PdfJs;
}
