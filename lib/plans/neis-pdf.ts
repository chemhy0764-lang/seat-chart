// NEIS '학기말 추정분할점수 전체교과목' PDF(글자가 들어 있는 PDF)를 읽는다.
// PDF 표는 칸 안에서 글자가 줄바꿈되어 한 칸이 여러 조각이 되고(예: '1차 지필' + '평가'), 편제·과목 칸은 여러 줄을 합친 칸의 가운데에 놓인다.
// 그래서 머리글의 열 위치와 각 줄의 높이로 조각을 칸에 배정한 뒤, 엑셀과 같은 줄 모양으로 바꿔 neis.ts의 해석기를 그대로 쓴다.
import { normalizeKind, parseNeisRows, type NeisTable } from "./neis.ts";
import type { PdfItem } from "./pdf.ts";

const cx = (i: PdfItem) => i.x + i.w / 2;

/**
 * 같은 높이에서 거의 맞닿은 글자 조각(간격 2.5pt 이하)을 한 조각으로 잇는다.
 * PDF를 만든 프로그램에 따라 '지필/수행'이 '지필', '/', '수행'처럼 잘게 나뉘기도 한다. 표의 다른 칸은 간격이 훨씬 넓어 섞이지 않는다.
 */
export function joinTouching(items: PdfItem[], maxGap = 2.5, yTol = 1.5): PdfItem[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: PdfItem[] = [];
  for (const it of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.y - it.y) <= yTol) {
      const gap = it.x - (prev.x + prev.w);
      if (gap <= maxGap && gap >= -2) {
        out[out.length - 1] = { str: prev.str + it.str, x: prev.x, y: prev.y, w: it.x + it.w - prev.x, h: Math.max(prev.h, it.h) };
        continue;
      }
    }
    out.push({ ...it });
  }
  return out;
}
const squash = (s: string) => s.replace(/\s+/g, "");
const NUM = /^-?\d+(?:\.\d+)?$/;

/** 이 PDF가 NEIS 추정분할점수 표인지(머리글로 판별). */
export function looksLikeNeisPdf(rawPages: PdfItem[][]): boolean {
  const pages = rawPages.map((p) => joinTouching(p));
  const text = pages.flat().map((i) => squash(i.str)).join("");
  return /성취수준추정분할점수/.test(text) && /(지필\/수행|정기시험\/수)/.test(text) && /반영비율/.test(text);
}

type Cols = { kind: number; ratio: number; exam: number; subject: number; area: number; values: number[] };

function findCols(items: PdfItem[]): { cols: Cols; headerY: number } | null {
  const by = (pred: (s: string) => boolean) => items.find((i) => pred(squash(i.str)));
  const kind = by((s) => s.startsWith("지필/수행") || s.startsWith("정기시험/수"));
  const ratio = by((s) => s === "반영비율");
  const exam = by((s) => s === "고사/영역");
  const subject = by((s) => s === "과목");
  const area = by((s) => s === "편제");
  const vals = ["A/B", "B/C", "C/D", "D/E"].map((h) => by((s) => s === h));
  // 'E/미도달'은 칸이 좁아 'E/'와 '미도달' 두 줄로 나뉘기도 한다. 아래 줄('미도달')의 위치를 쓴다.
  vals.push(by((s) => s === "E/미도달" || s === "미도달") ?? by((s) => s === "E/"));
  if (!kind || !ratio || !exam || !subject || vals[0] === undefined) return null;
  const present = vals.filter((v): v is PdfItem => v !== undefined);
  return {
    cols: {
      kind: cx(kind),
      ratio: cx(ratio),
      exam: cx(exam),
      subject: cx(subject),
      area: area ? cx(area) : subject.x - 40,
      values: present.map(cx),
    },
    headerY: Math.min(...present.map((v) => v.y), kind.y, ratio.y),
  };
}

/** 같은 칸에서 줄바꿈된 글자 조각들을 위에서 아래로 이어 붙인다. 숫자·로마자·괄호로 시작하는 줄은 앞 줄에 붙여 쓰고, 그 밖에는 띄어 쓴다. */
function joinLines(items: PdfItem[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  let out = "";
  for (const it of sorted) {
    const t = it.str.trim();
    if (t === "") continue;
    out += out === "" || /^[\dⅠ-Ⅹ(IV]/.test(t) ? t : ` ${t}`;
  }
  return out;
}

type Anchor = { y: number; kind: string };

/** PDF의 NEIS 표를 읽는다. NEIS 엑셀과 같은 결과(NeisTable)를 돌려준다. */
export function parseNeisPdf(rawPages: PdfItem[][]): NeisTable {
  const pages = rawPages.map((p) => joinTouching(p));
  const rows: string[][] = [];
  const row = (cells: Record<number, string | undefined>) => Array.from({ length: 14 }, (_, i) => cells[i] ?? "");
  // 제목 줄('2025학년도 2학기 주간 1학년 일반학과'): 머리글 위쪽의 글자를 이어 붙인다(보고서 이름과 날짜는 뺀다). 글자 조각이 '2026'과 '학년도'처럼 나뉘어도 읽힌다.
  const headerPage = pages.find((p) => findCols(p));
  const found0 = headerPage ? findCols(headerPage) : null;
  const headerTop = headerPage
    ? Math.max(...headerPage.filter((i) => /성취수준|지필\/수행|반영비율|고사\/영역|계열|편제|과정/.test(squash(i.str))).map((i) => i.y)) + 4
    : Infinity;
  const titleLine = headerPage && found0
    ? headerPage
        .filter((i) => i.y > headerTop && !/전체교과목|^학기말|^\d{4}\.\d{2}\.\d{2}\.?$/.test(squash(i.str)))
        .sort((a, b) => Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x)
        .map((i) => i.str.trim())
        .join(" ")
    : "";
  rows.push(row({ 0: titleLine }));
  rows.push(row({ 4: "편제", 5: "과목", 6: "지필/수행구분", 7: "반영비율", 8: "고사/영역", 9: "성취수준추정분할점수" }));

  for (const page of pages) {
    const found = findCols(page);
    if (!found) continue;
    const { cols, headerY } = found;
    const body = page.filter((i) => i.y < headerY - 3);

    // 줄의 기준: 지필/수행/미산출 칸, 그리고 '학기말최종추정분할점수'
    const KIND_LABELS = ["지필", "지필평가", "정기시험", "수행", "수행평가"];
    const anchors: Anchor[] = body
      .filter((i) => {
        const s = squash(i.str);
        // '미산출'은 구분 칸이 아니라 값 칸 자리에 놓이기도 한다
        return /학기말최종/.test(s) || s === "미산출" || (Math.abs(cx(i) - cols.kind) <= 22 && KIND_LABELS.includes(s));
      })
      .map((i) => ({ y: i.y, kind: /학기말최종/.test(squash(i.str)) ? "학기말최종추정분할점수" : normalizeKind(i.str) }))
      .sort((a, b) => b.y - a.y);
    if (anchors.length === 0) continue;

    // 줄마다 반영비율·고사/영역·값을 읽는다(줄의 위아래 경계는 이웃 줄과의 가운데)
    const lines = anchors.map((a, k) => {
      const prev = anchors[k - 1]?.y ?? a.y + 40;
      const next = anchors[k + 1]?.y ?? a.y - 40;
      const top = (a.y + prev) / 2;
      const bottom = (a.y + next) / 2;
      const inBand = (i: PdfItem) => i.y <= top + 0.01 && i.y > bottom - 0.01;
      const near = (i: PdfItem, c: number, tol: number) => Math.abs(cx(i) - c) <= tol;
      const ratio = body.find((i) => Math.abs(i.y - a.y) <= 6 && near(i, cols.ratio, 18) && NUM.test(i.str.trim()))?.str.trim() ?? "";
      const exam = joinLines(body.filter((i) => inBand(i) && near(i, cols.exam, 28)));
      const values: Record<number, string> = {};
      cols.values.forEach((c, j) => {
        const v = body.find((i) => Math.abs(i.y - a.y) <= 6 && near(i, c, 17) && NUM.test(i.str.trim()));
        if (v) values[9 + j] = v.str.trim();
      });
      return { a, ratio, exam, values };
    });

    // 과목 블록: '미산출' 또는 '학기말최종' 줄에서 끝난다. 과목·편제 칸은 블록 높이의 가운데에 있다.
    let start = 0;
    for (let k = 0; k < lines.length; k++) {
      const last = lines[k].a.kind === "미산출" || lines[k].a.kind === "학기말최종추정분할점수" || k === lines.length - 1;
      if (!last) continue;
      const topY = lines[start].a.y + 14;
      const bottomY = lines[k].a.y - 14;
      const inBlock = (i: PdfItem) => i.y <= topY && i.y >= bottomY;
      const subject = joinLines(body.filter((i) => inBlock(i) && Math.abs(cx(i) - cols.subject) <= 32));
      const area = joinLines(body.filter((i) => inBlock(i) && Math.abs(cx(i) - cols.area) <= 26));
      for (let m = start; m <= k; m++) {
        const l = lines[m];
        rows.push(
          row({
            ...(m === start ? { 4: area, 5: subject } : {}),
            6: l.a.kind,
            7: l.ratio,
            8: l.exam,
            ...l.values,
          }),
        );
      }
      start = k + 1;
    }
  }
  return parseNeisRows(rows);
}
