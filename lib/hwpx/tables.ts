import { children, descendants, first } from "./dom.ts";
import { setCellText } from "./text.ts";

/** 템플릿 표 안의 칸 위치: [줄 번호, 시작 열(colAddr)] */
type Pos = [row: number, col: number];

/** 값 칸 묶음(머리글의 제목 칸 하나가 거느리는 칸들)에서 첫·가운데·마지막 칸의 서식 위치 */
type Trio = { first: Pos; mid: Pos; last: Pos };

type RowProto = { group?: Pos; name: Pos; lead?: Pos; vals: Trio[] };

/** 묶음(추정/고정) 하나의 줄 서식: 여러 줄이면 첫 줄·가운데 줄·끝 줄, 한 줄이면 single(없으면 끝 줄). */
type GroupProtos = { first: RowProto; mid: RowProto; end: RowProto; single?: RowProto };

/**
 * 템플릿 표에서 어떤 칸의 서식(테두리·글꼴)을 본뜰지 정해 둔 표.
 * titles·labels·groups는 여러 개일 수 있고, 만들 표가 더 많이 필요하면 마지막 것을 되풀이한다.
 */
export type Family = {
  hasGroup: boolean;
  /** 값 칸 앞에 이름형 칸이 하나 더 있는지(수행평가의 '만점' 칸) */
  hasLead: boolean;
  header: { group?: Pos; name: Pos; titles: Pos[]; labelLead?: Pos; labels: Trio[] };
  groups: GroupProtos[];
};

const trios = (row: number, cols: [number, number, number][]): Trio[] =>
  cols.map(([a, b, c]) => ({ first: [row, a], mid: [row, b], last: [row, c] }));

const rowProto = (r: number, o: { group?: boolean; name: number; lead?: number; vals: [number, number, number][] }): RowProto => ({
  group: o.group ? [r, 0] : undefined,
  name: [r, o.name],
  lead: o.lead !== undefined ? [r, o.lead] : undefined,
  vals: trios(r, o.vals),
});

/** 한 서식 표의 묶음 줄 서식을 줄 번호로 지정한다. */
const groupProtos = (
  rows: { first: number; mid: number; end: number; single?: number },
  o: { name: number; lead?: number; vals: [number, number, number][] },
): GroupProtos => ({
  first: rowProto(rows.first, { group: true, ...o }),
  mid: rowProto(rows.mid, o),
  end: rowProto(rows.end, o),
  single: rows.single !== undefined ? rowProto(rows.single, { group: true, ...o }) : undefined,
});

/** 정기시험 공지의 2학년 표(값 4칸). 묶음 둘(추정 15줄, 고정 1줄). */
export const F4: Family = {
  hasGroup: true,
  hasLead: false,
  header: { group: [0, 0], name: [0, 1], titles: [[0, 2]], labels: trios(1, [[2, 3, 5]]) },
  groups: [groupProtos({ first: 2, mid: 3, end: 16, single: 17 }, { name: 1, vals: [[2, 3, 5]] })],
};

/** 정기시험 공지의 1학년 표(값 5칸, E/I 포함). 묶음 하나(추정 6줄). */
export const F5: Family = {
  hasGroup: true,
  hasLead: false,
  header: { group: [0, 0], name: [0, 1], titles: [[0, 2]], labels: trios(1, [[2, 3, 6]]) },
  groups: [groupProtos({ first: 2, mid: 3, end: 7 }, { name: 1, vals: [[2, 3, 6]] })],
};

/** 수행평가 공지의 1학년 표(구분, 과목, 만점, 값 5칸). */
export const PERF5: Family = {
  hasGroup: true,
  hasLead: true,
  header: { group: [0, 0], name: [0, 1], titles: [[0, 2]], labelLead: [1, 2], labels: trios(1, [[3, 4, 7]]) },
  groups: [groupProtos({ first: 2, mid: 3, end: 7 }, { name: 1, lead: 2, vals: [[3, 4, 7]] })],
};

/** 수행평가 공지의 2학년 표(구분, 과목, 만점, 값 4칸). */
export const PERF4: Family = {
  hasGroup: true,
  hasLead: true,
  header: { group: [0, 0], name: [0, 1], titles: [[0, 2]], labelLead: [1, 2], labels: trios(1, [[3, 4, 6]]) },
  groups: [groupProtos({ first: 2, mid: 3, end: 16 }, { name: 1, lead: 2, vals: [[3, 4, 6]] })],
};

/** 2차 정기시험·학기말 공지의 1학년 표(2차 5칸 + 학기말 5칸). 묶음 둘(추정 5줄, 고정 6줄). */
export const T12: Family = {
  hasGroup: true,
  hasLead: false,
  header: { group: [0, 0], name: [0, 1], titles: [[0, 2], [0, 7]], labels: trios(1, [[2, 3, 6], [7, 8, 11]]) },
  groups: [
    groupProtos({ first: 2, mid: 3, end: 6 }, { name: 1, vals: [[2, 3, 6], [7, 8, 11]] }),
    groupProtos({ first: 7, mid: 8, end: 12 }, { name: 1, vals: [[2, 3, 6], [7, 8, 11]] }),
  ],
};

/** 2차 정기시험·학기말 공지의 2학년 표(2차 4칸 + 학기말 4칸). 묶음 둘(추정 8줄, 고정 10줄). */
export const T10: Family = {
  hasGroup: true,
  hasLead: false,
  header: { group: [0, 0], name: [0, 1], titles: [[0, 2], [0, 6]], labels: trios(1, [[2, 3, 5], [6, 7, 9]]) },
  groups: [
    groupProtos({ first: 2, mid: 3, end: 9 }, { name: 1, vals: [[2, 3, 5], [6, 7, 9]] }),
    groupProtos({ first: 10, mid: 11, end: 19 }, { name: 1, vals: [[2, 3, 5], [6, 7, 9]] }),
  ],
};

export type SpecRow = { name: string; lead?: string; values: string[] };
export type SpecGroup = { lines?: string[]; rows: SpecRow[] };
export type TableSpec = {
  /** 머리글 묶음: 제목 칸과 그 아래 라벨 칸들(수행평가의 '만점'은 leadLabel로) */
  titles: { title: string; labels: string[] }[];
  leadLabel?: string;
  /** 이름 칸 머리글(서식에 맞춰 기본은 "과목") */
  nameLabel?: string;
  groups: SpecGroup[];
};

export function cellAt(tbl: Element, [row, col]: Pos): Element {
  const tr = children(tbl, "tr")[row];
  if (!tr) throw new Error(`템플릿 표에 ${row}번째 줄이 없어요.`);
  for (const tc of children(tr, "tc")) {
    const addr = first(tc, "cellAddr");
    if (addr && Number(addr.getAttribute("colAddr")) === col) return tc;
  }
  throw new Error(`템플릿 표의 ${row}줄 ${col}열 칸을 찾지 못했어요.`);
}

const num = (el: Element | undefined, attr: string): number => Number(el?.getAttribute(attr) ?? 0);
const width = (tc: Element) => num(first(tc, "cellSz"), "width");
const height = (tc: Element) => num(first(tc, "cellSz"), "height");

type CellOpts = { col: number; row: number; colSpan?: number; rowSpan?: number; w: number; h: number; lines: string[] };

function makeCell(proto: Element, o: CellOpts): Element {
  const tc = proto.cloneNode(true) as Element;
  const set = (name: string, attrs: Record<string, number>) => {
    const el = first(tc, name);
    if (!el) throw new Error(`칸에 ${name} 요소가 없어요.`);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  };
  set("cellAddr", { colAddr: o.col, rowAddr: o.row });
  set("cellSpan", { colSpan: o.colSpan ?? 1, rowSpan: o.rowSpan ?? 1 });
  set("cellSz", { width: o.w, height: o.h });
  setCellText(tc, o.lines);
  return tc;
}

function evenSplit(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

/**
 * 템플릿 표의 칸을 복제해 새 표를 만든다. 칸의 테두리·글꼴·정렬은 템플릿 칸 그대로이고, 위치·크기·글자만 바꾼다.
 * 템플릿의 열 수와 같으면 열 너비도 템플릿 그대로 쓴다.
 */
export function buildTable(template: Element, family: Family, spec: TableSpec, newId: string): Element {
  const doc = template.ownerDocument;
  const prefix = template.prefix;
  const mkEl = (name: string) => doc.createElementNS(template.namespaceURI, `${prefix}:${name}`);

  const labelCount = spec.titles.reduce((s, t) => s + t.labels.length, 0);
  const lead = family.hasLead ? 1 : 0;
  const group = family.hasGroup ? 1 : 0;
  const ncols = group + 1 + lead + labelCount;

  // 열 너비
  const firstDataRow = family.groups[0].first;
  const tmplCols = group + 1 + lead + labelCountOfTemplate(template, family);
  const tableW = num(first(template, "sz"), "width");
  const widths: number[] = [];
  if (tmplCols === ncols) {
    const row = children(template, "tr")[firstDataRow.name[0]];
    const byAddr = new Map<number, number>();
    for (const tc of children(row, "tc")) byAddr.set(num(first(tc, "cellAddr"), "colAddr"), width(tc));
    for (let c = 0; c < ncols; c++) widths.push(byAddr.get(c) ?? 0);
  } else {
    const fixed: number[] = [];
    if (group) fixed.push(width(cellAt(template, firstDataRow.group!)));
    fixed.push(width(cellAt(template, firstDataRow.name)));
    if (lead) fixed.push(width(cellAt(template, firstDataRow.lead!)));
    const rest = tableW - fixed.reduce((a, b) => a + b, 0);
    widths.push(...fixed, ...evenSplit(rest, labelCount));
  }

  const hp = family.header;
  const pick = <T,>(list: T[], i: number): T => list[Math.min(i, list.length - 1)];
  const titleH = height(cellAt(template, hp.titles[0]));
  const labelH = height(cellAt(template, hp.labels[0].first));
  const dataH = height(cellAt(template, family.groups[0].mid.name));

  // 값 칸 하나하나가 어느 제목 묶음의 몇 번째 칸인지
  const meta: { tg: number; role: "first" | "mid" | "last" }[] = [];
  spec.titles.forEach((t, tg) =>
    t.labels.forEach((_, j) => meta.push({ tg, role: j === 0 ? "first" : j === t.labels.length - 1 ? "last" : "mid" })),
  );

  const trs: Element[] = [];
  const newTr = (cells: Element[]) => {
    const tr = mkEl("tr");
    for (const c of cells) tr.appendChild(c);
    trs.push(tr);
  };

  // 머리글 1줄: 구분, 과목, 제목들
  const head0: Element[] = [];
  let col = 0;
  if (group) head0.push(makeCell(cellAt(template, hp.group!), { col: col++, row: 0, rowSpan: 2, w: widths[0], h: titleH + labelH, lines: ["구분"] }));
  head0.push(makeCell(cellAt(template, hp.name), { col: col++, row: 0, rowSpan: 2, w: widths[col - 1], h: titleH + labelH, lines: [spec.nameLabel ?? "과목"] }));
  const leadCol = lead ? col++ : -1;
  // 제목 칸은 '만점'(있다면)부터 시작한다
  let labelCol = leadCol >= 0 ? leadCol : col;
  spec.titles.forEach((t, i) => {
    const span = t.labels.length + (i === 0 ? lead : 0);
    const w = widths.slice(labelCol, labelCol + span).reduce((a, b) => a + b, 0);
    head0.push(makeCell(cellAt(template, pick(hp.titles, i)), { col: labelCol, row: 0, colSpan: span, w, h: titleH, lines: [t.title] }));
    labelCol += span;
  });
  newTr(head0);

  // 머리글 2줄: 만점, A/B, B/C ...
  const head1: Element[] = [];
  let c = group + 1;
  if (lead) {
    head1.push(makeCell(cellAt(template, hp.labelLead!), { col: c, row: 1, w: widths[c], h: labelH, lines: [spec.leadLabel ?? "만점"] }));
    c++;
  }
  let k = 0;
  spec.titles.forEach((t) =>
    t.labels.forEach((label) => {
      const m = meta[k++];
      const trio = pick(hp.labels, m.tg);
      head1.push(makeCell(cellAt(template, trio[m.role]), { col: c, row: 1, w: widths[c], h: labelH, lines: label.split("\n") }));
      c++;
    }),
  );
  newTr(head1);

  // 자료 줄
  let rowAddr = 2;
  spec.groups.forEach((g, gi) => {
    const protos = pick(family.groups, gi);
    const rows = g.rows;
    rows.forEach((r, ri) => {
      let proto: RowProto;
      if (rows.length === 1) proto = protos.single ?? { ...protos.end, group: protos.first.group };
      else if (ri === 0) proto = protos.first;
      else if (ri === rows.length - 1) proto = protos.end;
      else proto = protos.mid;
      const cells: Element[] = [];
      let cc = 0;
      if (group && ri === 0) {
        cells.push(
          makeCell(cellAt(template, proto.group ?? protos.first.group!), {
            col: 0,
            row: rowAddr,
            rowSpan: rows.length,
            w: widths[0],
            h: dataH * rows.length,
            lines: g.lines ?? [""],
          }),
        );
      }
      if (group) cc = 1;
      cells.push(makeCell(cellAt(template, proto.name), { col: cc, row: rowAddr, w: widths[cc], h: dataH, lines: [r.name] }));
      cc++;
      if (lead) {
        cells.push(makeCell(cellAt(template, proto.lead!), { col: cc, row: rowAddr, w: widths[cc], h: dataH, lines: [r.lead ?? ""] }));
        cc++;
      }
      r.values.forEach((v, j) => {
        const m = meta[j] ?? meta[meta.length - 1];
        const trio = pick(proto.vals, m.tg);
        cells.push(makeCell(cellAt(template, trio[m.role]), { col: cc, row: rowAddr, w: widths[cc], h: dataH, lines: [v] }));
        cc++;
      });
      newTr(cells);
      rowAddr++;
    });
  });

  const out = template.cloneNode(true) as Element;
  for (const tr of children(out, "tr")) out.removeChild(tr);
  for (const tr of trs) out.appendChild(tr);
  out.setAttribute("id", newId);
  out.setAttribute("rowCnt", String(rowAddr));
  out.setAttribute("colCnt", String(ncols));
  const sz = first(out, "sz");
  sz?.setAttribute("height", String(titleH + labelH + dataH * (rowAddr - 2)));
  sz?.setAttribute("width", String(widths.reduce((a, b) => a + b, 0)));
  const zones = first(out, "cellzoneList");
  if (zones) {
    for (const z of children(zones, "cellzone")) {
      z.setAttribute("endRowAddr", String(rowAddr - 1));
      z.setAttribute("endColAddr", String(ncols - 1));
    }
  }
  return out;
}

/** 템플릿 표가 가진 라벨(값) 칸 수 */
function labelCountOfTemplate(template: Element, family: Family): number {
  const total = Number(template.getAttribute("colCnt"));
  return total - (family.hasGroup ? 1 : 0) - 1 - (family.hasLead ? 1 : 0);
}

/** 문서에서 데이터 표(줄 수가 많은 표)만 문서 순서대로 */
export function tablesOf(doc: Document): Element[] {
  return descendants(doc, "tbl");
}
