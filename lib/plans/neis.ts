// NEIS에서 내려받은 '학기말 추정분할점수 전체교과목' 표(엑셀)를 읽는다.
// 열: 편제(교과) · 과목 · 지필/수행구분 · 반영비율 · 고사/영역 · A/B B/C C/D D/E E/미도달
// 과목 이름은 첫 줄에만 있고(예: '공통국어1(4)'), 그 아래 줄들이 지필(1차·2차 정기시험), 수행, 학기말최종, 미산출로 이어진다.
// 쪽이 바뀌면 머리글이 반복된다.

export type NeisSubject = {
  name: string;
  area: string;
  /** 1차·2차 정기시험의 성취수준별 분할점수(1학년은 5개, 2·3학년은 4개) */
  first: string[] | null;
  second: string[] | null;
  /** 수행평가: 반영비율(=만점)과 분할점수 */
  perf: { max: string; values: string[] } | null;
  /** 학기말 최종 추정분할점수 */
  final: string[] | null;
};

export type NeisTable = {
  grade: number | null;
  year: number | null;
  semester: number | null;
  subjects: NeisSubject[];
};

/** 엑셀 숫자 글자('52.0', '82.410')를 학교 공지에 쓰는 모양('52', '82.41')으로. 숫자가 아니면 그대로. */
export function tidyNumber(text: string): string {
  const t = text.trim();
  return /^-?\d+(?:\.\d+)?$/.test(t) ? String(Number(t)) : t;
}

const KINDS = ["지필", "수행", "미산출"];

/** 이 표가 NEIS 추정분할점수 표인지(머리글로 판별). */
export function looksLikeNeis(rows: string[][]): boolean {
  return rows.some((r) => r.includes("지필/수행구분")) && rows.some((r) => r.some((c) => /성취수준추정분할점수/.test(c)));
}

export function parseNeisRows(rows: string[][]): NeisTable {
  const table: NeisTable = { grade: null, year: null, semester: null, subjects: [] };

  // 제목 줄: '2026학년도   1학기   주간   1학년   일반학과'
  for (const row of rows) {
    const line = row.join(" ").replace(/\s+/g, " ");
    const m = /(\d{4})\s*학년도\s*(\d)\s*학기.*?(\d)\s*학년/.exec(line);
    if (m && !/학년도 학기/.test(line)) {
      table.year = Number(m[1]);
      table.semester = Number(m[2]);
      table.grade = Number(m[3]);
      break;
    }
  }
  const width = table.grade === 1 ? 5 : 4; // 1학년만 E/미도달 열을 쓴다

  let col = { area: 4, subject: 5, kind: 6, ratio: 7, exam: 8, first: 9 };
  let area = "";
  let current: NeisSubject | null = null;

  for (const row of rows) {
    const cells = row.map((c) => (c ?? "").trim());
    // 머리글 줄: 열 위치를 다시 잡는다(쪽마다 반복됨)
    if (cells.includes("지필/수행구분")) {
      col = {
        area: Math.max(0, cells.indexOf("편제")),
        subject: cells.indexOf("과목"),
        kind: cells.indexOf("지필/수행구분"),
        ratio: cells.indexOf("반영비율"),
        exam: cells.indexOf("고사/영역"),
        first: cells.findIndex((c) => /성취수준추정분할점수/.test(c)),
      };
      continue;
    }
    const kind = cells[col.kind] ?? "";
    const isFinal = /학기말최종/.test(kind);
    if (!KINDS.includes(kind) && !isFinal) continue;

    if (cells[col.area]) area = cells[col.area];
    if (cells[col.subject]) {
      const name = cells[col.subject].replace(/\(\d+\)\s*$/, "").trim();
      // 쪽이 바뀌면 같은 과목의 이름이 다음 쪽 첫 줄에 다시 나온다. 같은 과목이면 이어서 읽는다.
      current = table.subjects.find((x) => x.name === name) ?? null;
      if (!current) {
        current = { name, area, first: null, second: null, perf: null, final: null };
        table.subjects.push(current);
      }
    }
    if (!current || kind === "미산출") continue;

    const values = Array.from({ length: width }, (_, i) => tidyNumber(cells[col.first + i] ?? ""));
    if (values.every((v) => v === "")) continue;
    if (isFinal) current.final = values;
    else if (kind === "수행") current.perf = { max: tidyNumber(cells[col.ratio] ?? ""), values };
    else if (/1\s*차/.test(cells[col.exam] ?? "")) current.first = values;
    else if (/2\s*차/.test(cells[col.exam] ?? "")) current.second = values;
  }
  return table;
}

export type NeisTexts = { first: string; perf: string; term: string };

/** 시험별 붙여넣기 형식 글자('추정' 줄과 '과목 ⇥ 값…' 줄). 이 표에는 추정분할 과목만 있다. */
export function neisTexts(table: NeisTable): NeisTexts {
  const lines = (pick: (s: NeisSubject) => string[] | null) => {
    const rows = table.subjects.map(pick).filter((r): r is string[] => r !== null).map((r) => r.join("\t"));
    return rows.length > 0 ? ["추정", ...rows].join("\n") : "";
  };
  return {
    first: lines((s) => (s.first ? [s.name, ...s.first] : null)),
    perf: lines((s) => (s.perf ? [s.name, s.perf.max, ...s.perf.values] : null)),
    term: lines((s) => (s.second && s.final ? [s.name, ...s.second, ...s.final] : null)),
  };
}

/**
 * 붙여넣기 형식 글자가 어느 시험의 표인지, 한 줄의 값 개수로 짐작한다.
 * 값 개수: 1차 정기시험은 4개(1학년 5개), 수행평가는 만점 포함 5개(6개), 2차·학기말은 8개(10개).
 */
export function guessCutoffKind(text: string, grade: number): "first" | "perf" | "term" | null {
  const line = text.split("\n").find((l) => l.includes("\t"));
  if (!line) return null;
  const values = line.split("\t").length - 1;
  const base = grade === 1 ? 5 : 4;
  if (values === base) return "first";
  if (values === base + 1) return "perf";
  if (values === base * 2) return "term";
  return null;
}

