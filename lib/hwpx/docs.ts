import { children, descendants, first, removeAll } from "./dom.ts";
import { openPackage, savePackage, type Pkg } from "./package.ts";
import type { ParsedGroup } from "./data.ts";
import { buildTable, cellAt, F4, F5, PERF, tablesOf, type SpecGroup, type TableSpec } from "./tables.ts";
import { replaceAll, setCellText, setParagraphText } from "./text.ts";

export const YEARS = [2026, 2027, 2028] as const;
export type Semester = 1 | 2;
export type Term = { year: number; semester: Semester };

export type Templates = {
  guideFirst: ArrayBuffer | Uint8Array;
  guideSecond: ArrayBuffer | Uint8Array;
  minutes: ArrayBuffer | Uint8Array;
  noticeWritten: ArrayBuffer | Uint8Array;
  noticePerf: ArrayBuffer | Uint8Array;
};

// ───────── 산출 안내 ─────────

export type GuideOptions = Term & { aRatioLimit: string };

/** 템플릿이 만들어진 학년도·학기(글자 치환의 기준) */
const GUIDE_BASE = { first: { year: 2026, semester: 2 }, second: { year: 2026, semester: 1 } } as const;

export async function buildGuide(kind: "first" | "second", data: ArrayBuffer | Uint8Array, o: GuideOptions): Promise<Uint8Array> {
  const pkg = await openPackage(data);
  const base = GUIDE_BASE[kind];
  replaceAll(pkg.section, [
    [`${base.year}학년도`, `${o.year}학년도`],
    [`${base.semester}학기`, `${o.semester}학기`],
    ["23.9%", `${o.aRatioLimit}%`],
  ]);
  return savePackage(pkg);
}

// ───────── 교과협의록 ─────────

export type MinutesRow = {
  grade: string;
  subject: string;
  writer: string;
  reviewer: string;
  exam: string;
  method: string;
  levels: string;
  average: string;
};

export type MinutesOptions = Term & {
  subjectArea: string;
  exam: 1 | 2;
  dateText: string;
  place: string;
  attendees: string;
  recorder: string;
  rows: MinutesRow[];
  remarks: string;
};

const MIN_DATA_ROWS = 10;

export async function buildMinutes(data: ArrayBuffer | Uint8Array, o: MinutesOptions): Promise<Uint8Array> {
  const pkg = await openPackage(data);
  const doc = pkg.section;
  replaceAll(doc, [["( 00 )과", `( ${o.subjectArea} )과`]]);

  const [head, list] = tablesOf(doc);
  setCellText(cellAt(head, [1, 1]), [o.dateText]);
  setCellText(cellAt(head, [1, 3]), [o.place]);
  setCellText(cellAt(head, [2, 1]), [o.attendees]);
  setCellText(cellAt(head, [2, 3]), [o.recorder]);
  setCellText(cellAt(head, [3, 1]), [`${o.year}학년도 ${o.semester}학기 ${o.exam}차 정기시험 원안지 검토 및 분할점수 산출`]);
  setCellText(cellAt(head, [5, 1]), [o.remarks || "·"]);

  // 과목 표: 첫 자료 줄(서식 12)과 나머지 줄(서식 10)을 본떠 줄을 다시 만든다.
  const trs = children(list, "tr");
  const protoFirst = trs[1];
  const protoRest = trs[2];
  const total = Math.max(o.rows.length, MIN_DATA_ROWS);
  for (const tr of trs.slice(1)) list.removeChild(tr);
  for (let i = 0; i < total; i++) {
    const r = o.rows[i];
    const tr = (i === 0 ? protoFirst : protoRest).cloneNode(true) as Element;
    const values = r ? [r.grade, r.subject, r.writer, r.reviewer, r.exam, r.method, r.levels, r.average] : Array(8).fill("");
    children(tr, "tc").forEach((tc, c) => {
      first(tc, "cellAddr")?.setAttribute("rowAddr", String(i + 1));
      setCellText(tc, [values[c]]);
    });
    list.appendChild(tr);
  }
  list.setAttribute("rowCnt", String(total + 1));
  const rowH = Number(first(first(protoRest, "tc")!, "cellSz")?.getAttribute("height") ?? 0);
  const headH = Number(first(first(trs[0], "tc")!, "cellSz")?.getAttribute("height") ?? 0);
  first(list, "sz")?.setAttribute("height", String(headH + rowH * total));
  const zones = first(list, "cellzoneList");
  if (zones) for (const z of children(zones, "cellzone")) z.setAttribute("endRowAddr", String(total));
  return savePackage(pkg);
}

// ───────── 공지(가정통신문)·학업성적관리회의 자료 ─────────

export type NoticeKind = "first" | "term" | "perf";
export type GradeData = { grade: 1 | 2 | 3; groups: ParsedGroup[] };

export type NoticeOptions = Term & {
  kind: NoticeKind;
  grades: GradeData[];
  /** 공지일 */
  date: { year: number; month: number; day: number };
};

const LABELS4 = ["A/B", "B/C", "C/D", "D/E"];
const LABELS5 = [...LABELS4, "E/I(미도달)"];
export const valueCountFor = (kind: NoticeKind, grade: number): number => {
  const n = grade === 1 ? 5 : 4;
  return kind === "term" ? n * 2 : n;
};

const groupLines = (kind: string) => ["성취수준별", kind, "분할점수"];

function specFor(o: NoticeOptions, g: GradeData): TableSpec {
  const labels = g.grade === 1 ? LABELS5 : LABELS4;
  const s = o.semester;
  if (o.kind === "perf") {
    const rows = g.groups.flatMap((x) => x.rows);
    return {
      titles: [{ title: `${s}학기 수행평가`, labels }],
      leadLabel: "만점",
      groups: [{ rows: rows.map((r) => ({ name: r.name, lead: r.lead, values: r.values })) }],
    };
  }
  const groups: SpecGroup[] = g.groups.map((x) => ({
    lines: groupLines(x.kind === "추정" ? "추정" : "고정"),
    rows: x.rows.map((r) => ({ name: r.name, values: r.values })),
  }));
  const titles =
    o.kind === "first"
      ? [{ title: `${s}학기 1차 정기시험`, labels }]
      : [
          { title: `${s}학기 2차 정기시험`, labels },
          { title: `${s}학기 학기말`, labels },
        ];
  return { titles, groups };
}

let idCounter = 0;
const nextId = () => String(1500000000 + ++idCounter * 7919);

function paragraphOf(el: Element): Element {
  let n: Node | null = el;
  while (n && !(n.nodeType === 1 && (n as Element).localName === "p")) n = n.parentNode;
  return n as Element;
}

function fillTables(pkg: Pkg, o: NoticeOptions): Element[] {
  const doc = pkg.section;
  const tables = tablesOf(doc);
  const targets = [tables[2], tables[3], tables[4]];
  const perf = o.kind === "perf";
  const templates = perf ? [PERF, PERF, PERF] : [F5, F4, F4];
  const templateTbls = perf ? [tables[2], tables[2], tables[2]] : [tables[2], tables[3], tables[3]];
  const made: Element[] = [];
  // 템플릿 표는 바꾸기 전 복사본에서 본뜬다.
  const frozen = templateTbls.map((t) => t.cloneNode(true) as Element);
  targets.forEach((target, i) => {
    const g = o.grades.find((x) => x.grade === i + 1);
    if (!g) throw new Error(`${i + 1}학년 자료가 없어요.`);
    const built = buildTable(frozen[i], templates[i], specFor(o, g), nextId());
    target.parentNode!.replaceChild(built, target);
    made.push(built);
  });
  return made;
}

function noticeTextPairs(o: NoticeOptions): [string, string][] {
  const d = `${o.date.year}. ${o.date.month}. ${o.date.day}.`;
  const pairs: [string, string][] = [
    ["2025학년도", `${o.year}학년도`],
    ["2학기", `${o.semester}학기`],
    ["2025. 9. 22.", d],
  ];
  if (o.kind !== "perf") pairs.splice(2, 0, ["지필평가", "정기시험"]);
  if (o.kind === "term") pairs.splice(3, 0, ["1차 정기시험", "2차 정기시험 및 학기말"]);
  return pairs;
}

export async function buildNotice(data: ArrayBuffer | Uint8Array, o: NoticeOptions): Promise<Uint8Array> {
  const pkg = await openPackage(data);
  fillTables(pkg, o);
  replaceAll(pkg.section, noticeTextPairs(o));
  return savePackage(pkg);
}

/** 학업성적관리회의 자료: 가정통신문 표를 그대로 쓰되 머리글·인사말·참고·직인을 뺀다. */
export async function buildMeeting(data: ArrayBuffer | Uint8Array, o: Omit<NoticeOptions, "kind"> & { kind: "first" | "term" }): Promise<Uint8Array> {
  const pkg = await openPackage(data);
  const doc = pkg.section;
  const root = doc.documentElement;
  const made = fillTables(pkg, o);
  replaceAll(doc, noticeTextPairs(o).filter(([from]) => !from.includes(". ")));

  const paras = children(root, "p");
  const index = (el: Element) => paras.indexOf(paragraphOf(el));
  const firstTable = index(made[0]);
  const lastTable = index(made[2]);
  const heading = firstTable - 2;

  // 첫 문단: 쪽 설정(secPr)이 든 run은 두고, 머리글 표와 그림이 든 run만 지운다.
  for (const run of children(paras[0], "run")) {
    if (descendants(run, "tbl").length > 0 || descendants(run, "pic").length > 0) paras[0].removeChild(run);
  }
  removeAll(paras.slice(1, heading));
  removeAll(paras.slice(lastTable + 1));

  const title = paras[heading].cloneNode(true) as Element;
  const examText = o.kind === "first" ? "1차 정기시험" : "2차 정기시험 및 학기말";
  setParagraphText(title, `${o.year}학년도 ${o.semester}학기 ${examText} 교과별 분할점수`);
  root.insertBefore(title, paras[heading]);
  return savePackage(pkg);
}
