import { children, descendants, first } from "./dom.ts";
import { setCellText } from "./text.ts";

/** 템플릿 표 안의 칸 위치: [줄 번호, 시작 열(colAddr)] */
type Pos = [row: number, col: number];

type RowProto = { group?: Pos; name: Pos; lead?: Pos; first: Pos; mid: Pos; last: Pos };

/** 템플릿 표에서 어떤 칸의 서식(테두리·글꼴)을 본뜰지 정해 둔 표 */
export type Family = {
  hasGroup: boolean;
  /** 값 칸 앞에 이름형 칸이 하나 더 있는지(수행평가의 '만점' 칸) */
  hasLead: boolean;
  header: { group?: Pos; name: Pos; title: Pos; labelLead?: Pos; labelFirst: Pos; labelMid: Pos; labelLast: Pos };
  /** A: 마지막이 아닌 묶음, B: 마지막 묶음. 묶음이 없으면 A만 쓴다. */
  A: { first: RowProto; mid: RowProto };
  B?: { first: RowProto; mid: RowProto; last: RowProto };
};

/** 1차·2차 정기시험 표(값 4칸: 2·3학년). 가정통신문 서식 표 4번째(2학년 표). */
export const F4: Family = {
  hasGroup: true,
  hasLead: false,
  header: { group: [0, 0], name: [0, 1], title: [0, 2], labelFirst: [1, 2], labelMid: [1, 3], labelLast: [1, 5] },
  A: {
    first: { group: [2, 0], name: [2, 1], first: [2, 2], mid: [2, 3], last: [2, 5] },
    mid: { name: [3, 1], first: [3, 2], mid: [3, 3], last: [3, 5] },
  },
  B: {
    first: { group: [10, 0], name: [10, 1], first: [10, 2], mid: [10, 3], last: [10, 5] },
    mid: { name: [11, 1], first: [11, 2], mid: [11, 3], last: [11, 5] },
    last: { name: [15, 1], first: [15, 2], mid: [15, 3], last: [15, 5] },
  },
};

/** 값 5칸(E/I 포함: 1학년). 가정통신문 서식 표 3번째(1학년 표). */
export const F5: Family = {
  hasGroup: true,
  hasLead: false,
  header: { group: [0, 0], name: [0, 1], title: [0, 2], labelFirst: [1, 2], labelMid: [1, 3], labelLast: [1, 6] },
  A: {
    first: { group: [2, 0], name: [2, 1], first: [2, 2], mid: [2, 3], last: [2, 6] },
    mid: { name: [3, 1], first: [3, 2], mid: [3, 3], last: [3, 6] },
  },
  B: {
    first: { group: [7, 0], name: [7, 1], first: [7, 2], mid: [7, 3], last: [7, 6] },
    mid: { group: [7, 0], name: [7, 1], first: [7, 2], mid: [7, 3], last: [7, 6] },
    last: { group: [7, 0], name: [7, 1], first: [7, 2], mid: [7, 3], last: [7, 6] },
  },
};

/** 수행평가 표(교과, 만점, 값). 수행평가 가정통신문 서식 표. */
export const PERF: Family = {
  hasGroup: false,
  hasLead: true,
  header: { name: [0, 0], title: [0, 1], labelLead: [1, 1], labelFirst: [1, 2], labelMid: [1, 3], labelLast: [1, 6] },
  A: {
    first: { name: [2, 0], lead: [2, 1], first: [2, 2], mid: [2, 3], last: [2, 6] },
    mid: { name: [3, 0], lead: [3, 1], first: [3, 2], mid: [3, 3], last: [3, 6] },
  },
};

export type SpecRow = { name: string; lead?: string; values: string[] };
export type SpecGroup = { lines?: string[]; rows: SpecRow[] };
export type TableSpec = {
  /** 머리글 묶음: 제목 칸과 그 아래 라벨 칸들(수행평가의 '만점'은 leadLabel로) */
  titles: { title: string; labels: string[] }[];
  leadLabel?: string;
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
  const firstDataRow = family.A.first;
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
  const titleH = height(cellAt(template, hp.title));
  const labelH = height(cellAt(template, hp.labelFirst));
  const dataH = height(cellAt(template, family.A.mid.name));

  const trs: Element[] = [];
  const newTr = (cells: Element[]) => {
    const tr = mkEl("tr");
    for (const c of cells) tr.appendChild(c);
    trs.push(tr);
  };

  // 머리글 1줄: 구분, 교과, 제목들
  const head0: Element[] = [];
  let col = 0;
  if (group) head0.push(makeCell(cellAt(template, hp.group!), { col: col++, row: 0, rowSpan: 2, w: widths[0], h: titleH + labelH, lines: ["구분"] }));
  head0.push(makeCell(cellAt(template, hp.name), { col: col++, row: 0, rowSpan: 2, w: widths[col - 1], h: titleH + labelH, lines: ["교과"] }));
  const leadCol = lead ? col++ : -1;
  // 제목 칸은 '만점'(있다면)부터 시작한다
  let labelCol = leadCol >= 0 ? leadCol : col;
  spec.titles.forEach((t, i) => {
    const span = t.labels.length + (i === 0 ? lead : 0);
    const w = widths.slice(labelCol, labelCol + span).reduce((a, b) => a + b, 0);
    head0.push(makeCell(cellAt(template, hp.title), { col: labelCol, row: 0, colSpan: span, w, h: titleH, lines: [t.title] }));
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
  const valueStart = c;
  spec.titles.forEach((t) =>
    t.labels.forEach((label) => {
      const j = c - valueStart;
      const proto = j === 0 ? hp.labelFirst : c === ncols - 1 ? hp.labelLast : hp.labelMid;
      head1.push(makeCell(cellAt(template, proto), { col: c, row: 1, w: widths[c], h: labelH, lines: [label] }));
      c++;
    }),
  );
  newTr(head1);

  // 자료 줄
  let rowAddr = 2;
  spec.groups.forEach((g, gi) => {
    const isFinal = gi === spec.groups.length - 1;
    const rows = g.rows;
    rows.forEach((r, ri) => {
      let proto: RowProto;
      if (isFinal && family.B) proto = ri === 0 ? family.B.first : ri === rows.length - 1 ? family.B.last : family.B.mid;
      else proto = ri === 0 ? family.A.first : family.A.mid;
      const cells: Element[] = [];
      let cc = 0;
      if (group && ri === 0) {
        cells.push(
          makeCell(cellAt(template, proto.group ?? family.A.first.group!), {
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
        const p = j === 0 ? proto.first : cc === ncols - 1 ? proto.last : proto.mid;
        cells.push(makeCell(cellAt(template, p), { col: cc, row: rowAddr, w: widths[cc], h: dataH, lines: [v] }));
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
