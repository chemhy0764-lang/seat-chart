// pdfjs-dist의 build/pdf.mjs는 형식 선언을 따로 찾지 못해, 우리가 쓰는 부분만 선언한다.
declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(options: Record<string, unknown>): { promise: Promise<unknown> };
}
