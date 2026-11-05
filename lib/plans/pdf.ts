// 평가계획서 교과별 협의록 PDF(글자가 들어 있는 PDF)에서 장소·참석자·기록자와 과목별 반영 비율 표를 읽는다.
// 글자 조각(item)의 위치를 이용한다: 이름칸('장소' 등) 옆·같은 줄 띠 안의 글자를 값으로 본다.

export type PdfItem = { str: string; x: number; y: number; w: number; h: number };

/** pdfjs-dist 모듈 중 쓰는 부분만 적은 모양(브라우저와 Node에서 서로 다른 빌드를 넘겨 쓰기 위해). */
export type PdfJs = {
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
      }>;
      destroy?: () => Promise<void>;
    }>;
  };
};

/** PDF 모든 쪽의 글자 조각을 위치와 함께 읽는다(빈 조각은 뺀다). */
export async function readPdfPages(bytes: ArrayBuffer | Uint8Array, pdfjs: PdfJs): Promise<PdfItem[][]> {
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, isEvalSupported: false }).promise;
  const pages: PdfItem[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const items: PdfItem[] = [];
      for (const raw of content.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
        if (typeof it.str !== "string" || it.str.trim() === "" || !it.transform) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height ?? 0 });
      }
      pages.push(items);
    }
  } finally {
    await doc.destroy?.();
  }
  return pages;
}

// ───────── 이름칸 옆의 값 ─────────

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const squash = (s: string) => s.replace(/\s+/g, "");

type Band = { top: number; bottom: number };
const inBand = (it: PdfItem, b: Band) => it.y >= b.bottom && it.y <= b.top;
/** 위에서 아래, 왼쪽에서 오른쪽 읽는 순서 */
const reading = (a: PdfItem, b: PdfItem) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x);

export type SubjectPlan = {
  grade: string;
  subject: string;
  /** 1차·2차 정기시험과 수행평가 반영 비율(예: '24%'). 실시하지 않으면 빈 글자 */
  first: string;
  second: string;
  perf: string;
  /** '추정분할', '고정분할', 분할점수를 쓰지 않으면 '-' */
  method: string;
};

export type PdfMinutes = {
  /** 제목 '( 사회 )과 회의록'의 교과 이름 */
  area: string;
  year: number | null;
  semester: number | null;
  place: string;
  attendees: string;
  recorder: string;
  subjects: SubjectPlan[];
};

function labelItem(items: PdfItem[], label: string): PdfItem | undefined {
  return items.find((i) => squash(i.str) === label);
}

/** 참석자 글자를 쉼표로 이은 이름 목록으로. 쉼표나 공백으로 나뉜 이름을 모두 같은 모양으로 만든다. */
export function normalizeNames(text: string): string {
  return text
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
}

// ───────── 반영 비율 표 ─────────

const pct = (cell: string | undefined): string => {
  const t = (cell ?? "").trim();
  if (t === "" || t === "-" || t === "–" || /미실시/.test(t)) return "";
  const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(t);
  return m ? `${m[1]}%` : "";
};

const methodOf = (cell: string | undefined): string => {
  const t = squash(cell ?? "");
  if (/추정/.test(t)) return "추정분할";
  if (/고정/.test(t)) return "고정분할";
  return "-";
};

/**
 * 표 한 줄(칸 글자들)을 읽는다. 칸 순서: 순번, 학년, 과목, [1차, 2차,] 수행평가, 과목성취도.
 * valueCols는 비율 칸 수(1차·2차·수행이면 3, 수행만이면 1).
 */
export function subjectFromCells(cells: string[], valueCols: number): SubjectPlan | null {
  const all = cells.map((x) => x.trim()).filter((x) => x !== "");
  // 표 왼쪽의 '협의·사항' 같은 세로 글자가 줄 앞에 붙어 올 수 있어, 순번(숫자)과 학년(1~3)이 이어지는 곳부터 읽는다.
  const start = all.findIndex((x, i) => /^\d+$/.test(x) && /^[1-3]$/.test(all[i + 1] ?? ""));
  if (start < 0) return null;
  const c = all.slice(start);
  if (c.length < 3 + valueCols) return null;
  const tail = c.slice(c.length - valueCols - 1); // 비율 칸들 + 과목성취도
  const subject = c.slice(2, c.length - valueCols - 1).join(" ").trim();
  if (subject === "") return null;
  const values = tail.slice(0, valueCols);
  const [first, second, perf] = valueCols === 3 ? values.map(pct) : ["", "", pct(values[0])];
  return { grade: c[1], subject, first, second, perf, method: methodOf(tail[valueCols]) };
}

/** 표 줄들(칸 글자 배열)에서 '순번 학년 과목 …' 머리글을 찾아 그 아래 줄들을 읽는다. */
export function subjectsFromRows(rows: string[][]): SubjectPlan[] {
  const out: SubjectPlan[] = [];
  for (let i = 0; i < rows.length; i++) {
    const head = squash(rows[i].join(" ")); // '1 차'처럼 글자 사이가 벌어진 PDF도 있어 공백을 없애고 본다
    if (!/순번/.test(head) || !/과목/.test(head) || !/성취도|수행평가/.test(head)) continue;
    if (/안전|환경|교육내용|시수/.test(head)) continue;
    const valueCols = /1차/.test(head) && /2차/.test(head) ? 3 : 1;
    for (let j = i + 1; j < rows.length; j++) {
      const text = rows[j].join(" ");
      if (/순번/.test(text) || /^\s*\d+\.\s/.test(text.trim())) break;
      const s = subjectFromCells(rows[j], valueCols);
      if (s) out.push(s);
    }
  }
  return out;
}

/** 글자 조각들을 같은 높이끼리 줄로 묶고, 줄마다 왼쪽에서 오른쪽 칸 글자 배열을 만든다. */
export function rowsOf(items: PdfItem[], tolerance = 2.5): string[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) <= tolerance);
    if (line) line.push(it);
    else lines.push([it]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((i) => clean(i.str)));
}

// ───────── 한 문서 ─────────

export function minutesFromPdf(pages: PdfItem[][]): PdfMinutes {
  const result: PdfMinutes = { area: "", year: null, semester: null, place: "", attendees: "", recorder: "", subjects: [] };
  const first = pages[0] ?? [];

  // 제목은 한 조각일 수도, 여러 조각으로 나뉠 수도 있어 줄 단위로 합쳐서 찾는다.
  for (const row of rowsOf(first)) {
    const tm = /\(\s*(.+?)\s*\)\s*과\s*회의록/.exec(row.join(" "));
    if (tm) {
      result.area = clean(tm[1]);
      break;
    }
  }

  const lbl = {
    date: labelItem(first, "일시"),
    place: labelItem(first, "장소"),
    people: labelItem(first, "참석자"),
    recorder: labelItem(first, "기록자"),
    topic: labelItem(first, "협의주제"),
  };
  if (lbl.date && lbl.people && lbl.topic) {
    // 이름칸이 있는 줄(일시·장소 / 참석자·기록자 / 협의주제)마다 위아래 경계를 이름칸 높이의 가운데로 잡아 띠로 쓴다.
    const y1 = lbl.date.y;
    const y2 = lbl.people.y;
    const y3 = lbl.topic.y;
    const b01 = (y1 + y2) / 2;
    const b12 = (y2 + y3) / 2;
    const row1: Band = { top: y1 + (y1 - b01), bottom: b01 };
    const row2: Band = { top: b01, bottom: b12 };
    const row3: Band = { top: b12, bottom: y3 - (b12 - y3) };
    const isLabel = (i: PdfItem) => ["일시", "장소", "참석자", "기록자", "협의주제"].includes(squash(i.str));
    const right = (label: PdfItem) => (i: PdfItem) => i.x >= label.x + label.w - 1;
    const text = (items: PdfItem[]) => clean([...items].sort(reading).map((i) => i.str).join(" "));

    if (lbl.place) {
      result.place = text(first.filter((i) => inBand(i, row1) && !isLabel(i) && right(lbl.place!)(i)));
    }
    const recorderX = lbl.recorder ? lbl.recorder.x : Number.POSITIVE_INFINITY;
    result.attendees = normalizeNames(
      text(first.filter((i) => inBand(i, row2) && !isLabel(i) && right(lbl.people!)(i) && i.x < recorderX - 1)),
    );
    if (lbl.recorder) {
      result.recorder = text(first.filter((i) => inBand(i, row2) && !isLabel(i) && right(lbl.recorder!)(i)));
    }
    const topic = text(first.filter((i) => inBand(i, row3) && !isLabel(i) && right(lbl.topic!)(i)));
    const ym = /(\d{4})\s*년/.exec(topic);
    const sm = /(\d)\s*학기/.exec(topic);
    if (ym) result.year = Number(ym[1]);
    if (sm) result.semester = Number(sm[1]);
  }

  result.subjects = subjectsFromRows(pages.flatMap((p) => rowsOf(p)));
  return result;
}
