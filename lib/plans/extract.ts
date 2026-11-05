// 올린 파일(hwpx, xlsx)에서 협의록의 장소·참석자·기록자와 분할점수 표를 읽어 온다.
// 파일 서식이 학교마다·해마다 달라서 읽은 값은 '제안'이다. 화면에서 관리자가 확인하고 고친 뒤 저장한다.
// PDF는 글자가 들어 있는 PDF만 읽는다(스캔한 그림이면 값을 직접 입력).
import JSZip from "jszip";
import { children, descendants, first, parseXml } from "../hwpx/dom.ts";
import { paragraphText } from "../hwpx/text.ts";
import { looksLikeNeis, neisTexts, parseNeisRows, type NeisTexts } from "./neis.ts";
import { looksLikeNeisPdf, parseNeisPdf } from "./neis-pdf.ts";
import { minutesFromPdf, readPdfPages, subjectsFromRows, type PdfJs, type SubjectPlan } from "./pdf.ts";

export type FileType = "hwpx" | "pdf" | "xlsx";
export type MinutesData = {
  place: string;
  attendees: string;
  recorder: string;
  /** 협의록의 '과목별 정기시험 및 수행평가 반영 비율' 표 */
  subjects?: SubjectPlan[];
};

export const fileTypeOf = (name: string): FileType | null => {
  const m = /\.(hwpx|pdf|xlsx)$/i.exec(name.trim());
  return m ? (m[1].toLowerCase() as FileType) : null;
};

/** 표 한 줄: 칸마다 글자와 세로 병합 칸 수 */
export type Cell = { text: string; rowSpan: number };
export type Table = Cell[][];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// ───────── hwpx ─────────

export async function readHwpxTables(bytes: ArrayBuffer | Uint8Array): Promise<Table[]> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("Contents/section0.xml")?.async("string");
  if (!xml) throw new Error("hwpx 파일에서 본문을 찾지 못했어요.");
  const doc = parseXml(xml);
  return descendants(doc, "tbl").map((tbl) =>
    children(tbl, "tr").map((tr) =>
      children(tr, "tc").map((tc) => {
        const sub = first(tc, "subList");
        const text = sub ? children(sub, "p").map((p) => paragraphText(p)).join("") : "";
        const span = first(tc, "cellSpan");
        return { text: clean(text), rowSpan: Number(span?.getAttribute("rowSpan") ?? 1) };
      }),
    ),
  );
}

// ───────── xlsx ─────────

const colIndex = (ref: string): number => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};

/** 첫 번째 시트의 칸 글자를 줄·칸 순서로 읽는다(수식은 저장된 값). */
export async function readXlsxRows(bytes: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(bytes);
  const shared: string[] = [];
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ss) {
    for (const si of descendants(parseXml(ss), "si")) {
      shared.push(descendants(si, "t").map((t) => t.textContent ?? "").join(""));
    }
  }
  const sheetName = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))[0];
  if (!sheetName) throw new Error("엑셀 파일에서 시트를 찾지 못했어요.");
  const sheet = parseXml((await zip.file(sheetName)!.async("string")) as string);
  const rows: string[][] = [];
  for (const row of descendants(sheet, "row")) {
    const cells: string[] = [];
    for (const c of children(row, "c")) {
      const idx = colIndex(c.getAttribute("r") ?? "A1");
      const type = c.getAttribute("t");
      const v = first(c, "v")?.textContent ?? "";
      let text = v;
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = descendants(c, "t").map((t) => t.textContent ?? "").join("");
      cells[idx] = clean(text);
    }
    rows.push(Array.from(cells, (x) => x ?? ""));
  }
  return rows;
}

// ───────── 협의록의 장소·참석자·기록자 ─────────

const LABELS: Record<"place" | "attendees" | "recorder", string> = { place: "장소", attendees: "참석자", recorder: "기록자" };
const norm = (s: string) => s.replace(/[\s:：]/g, "");

/** '장소' 같은 이름칸 오른쪽의 값 칸을 찾는다. 이름칸과 같은 줄에서 다음으로 글자가 있는 칸. */
function valueAfterLabel(rows: string[][], label: string): string {
  for (const row of rows) {
    const at = row.findIndex((t) => norm(t) === label);
    if (at < 0) continue;
    const value = row.slice(at + 1).find((t) => t.trim() !== "" && !Object.values(LABELS).includes(norm(t)));
    if (value !== undefined) return clean(value);
  }
  return "";
}

export function minutesFromRows(rows: string[][]): Pick<MinutesData, "place" | "attendees" | "recorder"> {
  return {
    place: valueAfterLabel(rows, LABELS.place),
    attendees: valueAfterLabel(rows, LABELS.attendees),
    recorder: valueAfterLabel(rows, LABELS.recorder),
  };
}

// ───────── 분할점수 표 → 붙여넣기 형식 글자 ─────────

const VALUE = /^(?:\d+(?:\.\d+)?|[-–·․.])$/;
const GROUP_CELL = /성취수준별|(추정|고정)\s*분할점수/;

/**
 * 표 줄들을 공지 화면에 붙여넣는 형식("추정"/"고정" 줄, "과목\t값\t값…")으로 바꾼다.
 * 묶음 칸(예: '성취수준별 추정 분할점수')을 만나면 추정/고정 표시 줄을 넣는다.
 * 줄 끝에 값(숫자나 -, ·)이 3개 이상 이어지는 줄만 자료 줄로 본다(머리글 줄은 건너뛴다).
 */
export function cutoffTextFromTables(tables: Table[]): string {
  const lines: string[] = [];
  for (const table of tables) {
    for (const row of table) {
      const texts = row.map((c) => c.text);
      // 묶음 칸은 묶음의 첫 줄 맨 앞에만 있다(한 줄짜리 묶음도 있어 세로 병합 여부는 보지 않는다).
      const marker = GROUP_CELL.test(texts[0] ?? "") ? texts[0] : undefined;
      let end = texts.length;
      while (end > 0 && (texts[end - 1] === "" || VALUE.test(texts[end - 1]))) end--;
      const values = texts.slice(end).filter((t) => t !== "");
      const nameCells = texts.slice(marker ? 1 : 0, end).filter((t) => t !== "");
      if (values.length < 3 || nameCells.length === 0) continue;
      if (marker) lines.push(/추정/.test(marker) ? "추정" : "고정");
      lines.push([nameCells[nameCells.length - 1], ...values].join("\t"));
    }
  }
  return lines.join("\n");
}

/** 엑셀 줄들을 같은 형식으로. '추정'/'고정'이라고만 적힌 칸이 있는 줄은 묶음 표시로 본다. */
export function cutoffTextFromRows(rows: string[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    const texts = row.map((t) => t ?? "");
    const markerCell = texts.find((t) => /^(성취수준별\s*)?(추정|고정)(\s*분할점수)?$/.test(t.trim()));
    let end = texts.length;
    while (end > 0 && (texts[end - 1] === "" || VALUE.test(texts[end - 1]))) end--;
    const values = texts.slice(end).filter((t) => t !== "");
    const nameCells = texts.slice(0, end).filter((t) => t !== "" && t !== markerCell);
    if (markerCell && values.length < 3) {
      lines.push(/추정/.test(markerCell) ? "추정" : "고정");
      continue;
    }
    if (values.length < 3 || nameCells.length === 0) continue;
    if (markerCell) lines.push(/추정/.test(markerCell) ? "추정" : "고정");
    lines.push([nameCells[nameCells.length - 1], ...values].join("\t"));
  }
  return lines.join("\n");
}

// ───────── 파일 하나에서 ─────────

export type Extracted = {
  fileType: FileType;
  minutes: MinutesData | null;
  /** 표 모양을 알 수 없는 파일에서 읽은 분할점수 표(붙여넣기 형식). 어느 시험인지는 모른다. */
  cutoffText: string | null;
  /** NEIS '학기말 추정분할점수 전체교과목' 엑셀에서 읽은 시험별 분할점수 표 */
  cutoffTexts: NeisTexts | null;
  /** 협의록 제목의 교과 이름, NEIS 표의 학년, 그리고 학년도·학기(PDF와 NEIS 엑셀에서 읽는다) */
  area: string;
  grade: number | null;
  year: number | null;
  semester: number | null;
  warnings: string[];
};

/**
 * 파일에서 값을 제안한다. 읽지 못한 값은 빈 글자로 두고 warnings에 이유를 적는다.
 * PDF를 읽으려면 pdf.js가 필요하다. 브라우저에서는 알아서 불러오고, 시험에서는 pdfjs를 넘긴다.
 */
export async function extractFromFile(
  name: string,
  bytes: ArrayBuffer | Uint8Array,
  options: { pdfjs?: PdfJs } = {},
): Promise<Extracted> {
  const fileType = fileTypeOf(name);
  if (!fileType) throw new Error("hwpx, xlsx, pdf 파일만 올릴 수 있어요.");
  const result: Extracted = { fileType, minutes: null, cutoffText: null, cutoffTexts: null, area: "", grade: null, year: null, semester: null, warnings: [] };
  try {
    if (fileType === "hwpx") {
      const tables = await readHwpxTables(bytes);
      const rows = tables.flatMap((t) => t.map((r) => r.map((c) => c.text)));
      result.minutes = { ...minutesFromRows(rows), subjects: subjectsFromRows(rows) };
      result.cutoffText = cutoffTextFromTables(tables);
    } else if (fileType === "xlsx") {
      const rows = await readXlsxRows(bytes);
      result.minutes = { ...minutesFromRows(rows), subjects: subjectsFromRows(rows) };
      if (looksLikeNeis(rows)) {
        const table = parseNeisRows(rows);
        result.cutoffTexts = neisTexts(table);
        result.grade = table.grade;
        result.year = table.year;
        result.semester = table.semester;
        if (table.subjects.length === 0) result.warnings.push("NEIS 표에서 과목을 찾지 못했어요.");
      } else {
        result.cutoffText = cutoffTextFromRows(rows);
      }
    } else {
      const pdfjs = options.pdfjs ?? (await (await import("./pdf-browser.ts")).loadPdfjs());
      const pages = await readPdfPages(bytes, pdfjs);
      if (looksLikeNeisPdf(pages)) {
        // NEIS '학기말 추정분할점수 전체교과목' PDF: 엑셀과 같이 시험별 표로 읽는다
        const table = parseNeisPdf(pages);
        result.cutoffTexts = neisTexts(table);
        result.grade = table.grade;
        result.year = table.year;
        result.semester = table.semester;
        if (table.subjects.length === 0) result.warnings.push("NEIS 표에서 과목을 찾지 못했어요.");
        return result;
      }
      const m = minutesFromPdf(pages);
      result.area = m.area;
      result.year = m.year;
      result.semester = m.semester;
      result.minutes = { place: m.place, attendees: m.attendees, recorder: m.recorder, subjects: m.subjects };
      if (!m.place && !m.attendees && !m.recorder && m.subjects.length === 0) {
        result.warnings.push("PDF에서 글자를 읽지 못했어요. 스캔한 그림이면 읽을 수 없으니 아래 값을 직접 입력하세요.");
      }
    }
  } catch (e) {
    result.warnings.push(e instanceof Error ? e.message : "파일을 읽지 못했어요.");
  }
  return result;
}
