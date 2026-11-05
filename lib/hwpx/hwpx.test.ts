import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOMParser as XmlDomParser, XMLSerializer as XmlSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";

Object.assign(globalThis, { DOMParser: XmlDomParser, XMLSerializer: XmlSerializer });

const { children, descendants, first, parseXml } = await import("./dom.ts");
const { replaceInParagraph, paragraphText } = await import("./text.ts");
const { buildTable, tablesOf, F4, F5, PERF4, PERF5, T10, T12 } = await import("./tables.ts");
const { openPackage } = await import("./package.ts");
const docs = await import("./docs.ts");
const { parseCutoffText } = await import("./data.ts");

const tpl = (name: string) => new Uint8Array(readFileSync(new URL(`../../public/hwpx/${name}.hwpx`, import.meta.url)));

async function sectionOf(bytes: Uint8Array): Promise<Document> {
  return (await openPackage(bytes)).section;
}

function allText(doc: Document): string {
  return descendants(doc, "p").map((p) => paragraphText(p)).join("\n");
}

type Cell = { col: number; row: number; cs: number; rs: number; fill: string; w: number; text: string[] };
function readTable(tbl: Element): Cell[] {
  const out: Cell[] = [];
  for (const tr of children(tbl, "tr")) {
    for (const tc of children(tr, "tc")) {
      const a = first(tc, "cellAddr")!;
      const s = first(tc, "cellSpan")!;
      const z = first(tc, "cellSz")!;
      const sub = first(tc, "subList")!;
      out.push({
        col: Number(a.getAttribute("colAddr")),
        row: Number(a.getAttribute("rowAddr")),
        cs: Number(s.getAttribute("colSpan")),
        rs: Number(s.getAttribute("rowSpan")),
        fill: tc.getAttribute("borderFillIDRef")!,
        w: Number(z.getAttribute("width")),
        text: children(sub, "p").map((p) => paragraphText(p).trim()),
      });
    }
  }
  return out;
}

/** 모든 칸이 표 영역을 빠짐없이, 겹치지 않게 덮는지 */
function assertCovers(tbl: Element) {
  const rows = Number(tbl.getAttribute("rowCnt"));
  const cols = Number(tbl.getAttribute("colCnt"));
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const c of readTable(tbl)) {
    for (let r = c.row; r < c.row + c.rs; r++) for (let k = c.col; k < c.col + c.cs; k++) grid[r][k]++;
  }
  assert.ok(grid.every((row) => row.every((v) => v === 1)), "칸이 겹치거나 비어 있어요");
  assert.equal(children(tbl, "tr").length, rows);
}

test("글자가 여러 조각으로 나뉘어 있어도 치환된다", async () => {
  const doc = parseXml(
    '<s xmlns:hp="urn:x"><hp:p><hp:run><hp:t>가져오기] 2</hp:t></hp:run><hp:run><hp:t>학기</hp:t></hp:run><hp:run><hp:t> 해당 2학기</hp:t></hp:run></hp:p></s>',
  );
  const p = descendants(doc, "p")[0];
  assert.equal(replaceInParagraph(p, "2학기", "1학기"), 2);
  assert.equal(paragraphText(p), "가져오기] 1학기 해당 1학기");
});

test("원본과 같은 자료로 만든 표는 원본 표와 같다(칸 위치·테두리·너비·글자)", async () => {
  const cases: [string, number, typeof F4][] = [
    ["notice-written", 3, F4],
    ["notice-written", 2, F5],
    ["notice-perf", 2, PERF5],
    ["notice-perf", 3, PERF4],
    ["notice-term", 2, T12],
    ["notice-term", 3, T10],
  ];
  for (const [name, idx, family] of cases) {
    const doc = await sectionOf(tpl(name));
    const original = tablesOf(doc)[idx];
    const cells = readTable(original);
    const hasGroup = family.hasGroup;
    const lead = family.hasLead ? 1 : 0;
    const titleCells = cells.filter((c) => c.row === 0 && c.cs > 1).sort((a, b) => a.col - b.col);
    const labelRow = cells.filter((c) => c.row === 1).sort((a, b) => a.col - b.col);
    const titles = titleCells.map((t, i) => ({
      title: t.text[0],
      labels: labelRow.filter((c) => c.col >= t.col + (i === 0 ? lead : 0) && c.col < t.col + t.cs).map((c) => c.text.join("\n")),
    }));
    const dataRows = new Map<number, Cell[]>();
    for (const c of cells.filter((c) => c.row >= 2)) dataRows.set(c.row, [...(dataRows.get(c.row) ?? []), c]);
    const rowNums = [...dataRows.keys()].sort((a, b) => a - b);
    const groups: { lines?: string[]; rows: { name: string; lead?: string; values: string[] }[] }[] = [];
    for (const r of rowNums) {
      const cs = dataRows.get(r)!.sort((a, b) => a.col - b.col);
      const g = hasGroup ? cs.find((c) => c.col === 0) : undefined;
      if (hasGroup && g) groups.push({ lines: g.text, rows: [] });
      if (!hasGroup && groups.length === 0) groups.push({ rows: [] });
      const body = cs.filter((c) => c.col >= (hasGroup ? 1 : 0) && !(hasGroup && c.col === 0));
      const nameCell = body[0];
      groups[groups.length - 1].rows.push({
        name: nameCell.text[0],
        lead: lead ? body[1].text[0] : undefined,
        values: body.slice(1 + lead).map((c) => c.text[0]),
      });
    }
    const leadLabel = lead ? labelRow[0].text[0] : undefined;
    const nameLabel = cells.find((c) => c.row === 0 && c.col === (hasGroup ? 1 : 0))!.text[0];
    const spec = { titles, leadLabel, nameLabel, groups };
    const built = buildTable(original, family, spec, "123");
    assertCovers(built);
    // 2차·학기말 서식 표에는 테두리 번호가 다른 줄과 어긋난 칸이 몇 개 있어(손으로 고친 흔적: 1학년 표 마지막 열 9·11번째 줄, 2학년 표 5번째 줄 학기말 3칸) 비교에서 뺀다.
    const quirk = (c: Cell) =>
      name === "notice-term" &&
      ((idx === 2 && c.col === 11 && (c.row === 9 || c.row === 11)) || (idx === 3 && c.row === 5 && c.col >= 7));
    const strip = (cs: Cell[]) => cs.map((c) => JSON.stringify([c.col, c.row, c.cs, c.rs, quirk(c) ? "*" : c.fill, c.w, c.text]));
    // 줄 높이가 다른 칸은 서식이 같아도 높이만 다르므로 높이는 비교하지 않는다.
    assert.deepEqual(strip(readTable(built)), strip(cells), `${name} 표 ${idx}`);
  }
});

test("산출 안내: 2027학년도 파일이 만들어진다", async () => {
  for (const [kind, name, sem] of [["first", "guide-1st", 1], ["second", "guide-2nd", 2]] as const) {
    const bytes = await docs.buildGuide(kind, tpl(name), { year: 2027, semester: sem, aRatioLimit: "25.5" });
    const zip = await JSZip.loadAsync(bytes);
    assert.equal(Object.keys(zip.files)[0], "mimetype");
    const text = allText(await sectionOf(bytes));
    assert.match(text, new RegExp(`2027학년도 ${sem}학기 ${kind === "first" ? "1차 정기시험 및 수행평가" : "2차 정기시험 및 학기말"} 분할점수 산출 안내`));
    assert.ok(!text.includes("2026학년도"), "2026이 남아 있어요");
    assert.ok(text.includes("25.5%") && !text.includes("23.9%"));
    assert.match(text, new RegExp(`2027학년도 ${sem}학기 O학년 OO과 분할점수`));
  }
});

type Row = { name: string; lead?: string; values: string[] };
const sample = (n: number, lead?: string): { kind: "추정" | "고정"; rows: Row[] }[] => [
  { kind: "추정", rows: [{ name: "예시교과A", lead, values: Array(n).fill("80") }, { name: "예시교과B", lead, values: Array(n).fill("70.5") }] },
  { kind: "고정", rows: [{ name: "예시교과C", lead, values: Array(n).fill("90") }, { name: "예시교과D", lead, values: Array(n).fill("·") }] },
];
const gradesFor = (kind: "first" | "term" | "perf") =>
  ([1, 2, 3] as const).map((grade) => ({
    grade,
    groups: sample(docs.valueCountFor(kind, grade), kind === "perf" ? "52" : undefined),
  }));

test("가정통신문 3종과 회의 자료: 표가 온전하고 글자가 바뀐다", async () => {
  const date = { year: 2027, month: 4, day: 20 };
  for (const kind of ["first", "term", "perf"] as const) {
    const bytes = await docs.buildNotice(tpl(kind === "perf" ? "notice-perf" : kind === "term" ? "notice-term" : "notice-written"), {
      year: 2027, semester: 1, kind, grades: gradesFor(kind), date,
    });
    const doc = await sectionOf(bytes);
    const text = allText(doc);
    assert.ok(!text.includes("2025"), `${kind}: 2025가 남아 있어요`);
    assert.ok(text.includes("2027. 4. 20."), `${kind}: 공지일`);
    assert.ok(text.includes("예시교과A") && text.includes("예시교과D"));
    for (const t of tablesOf(doc).filter((t) => Number(t.getAttribute("rowCnt")) >= 4)) assertCovers(t);
    if (kind !== "perf") assert.ok(!text.includes("지필평가"));
    if (kind === "term") assert.match(text, /2차 정기시험 및 학기말/);
    const grids = tablesOf(doc).filter((t) => Number(t.getAttribute("colCnt")) > 5);
    const cols = grids.map((t) => Number(t.getAttribute("colCnt")));
    if (kind === "first") assert.deepEqual(cols, [7, 6, 6]);
    if (kind === "term") assert.deepEqual(cols, [12, 10, 10]);
    if (kind === "perf") {
      assert.deepEqual(cols, [8, 7, 7]);
      assert.ok(!text.includes("전 과목 고정분할"), "3학년 자료를 줬는데 안내 문구가 남아 있어요");
      assert.ok(text.includes("2027학년도 1학기 3학년 수행평가"));
    }
  }
  // 수행평가에서 3학년 자료가 없으면 표는 2개이고 '전 과목 고정분할' 안내 문구가 남는다.
  const noThird = await docs.buildNotice(tpl("notice-perf"), {
    year: 2027, semester: 1, kind: "perf", grades: gradesFor("perf").slice(0, 2), date,
  });
  const noThirdDoc = await sectionOf(noThird);
  assert.deepEqual(tablesOf(noThirdDoc).filter((t) => Number(t.getAttribute("colCnt")) > 5).map((t) => Number(t.getAttribute("colCnt"))), [8, 7]);
  assert.ok(allText(noThirdDoc).includes("2027학년도 1학기 3학년은 전 과목 고정분할"));
  for (const kind of ["first", "term"] as const) {
    const bytes = await docs.buildMeeting(tpl(kind === "term" ? "notice-term" : "notice-written"), { year: 2027, semester: 2, kind, grades: gradesFor(kind), date });
    const doc = await sectionOf(bytes);
    const text = allText(doc);
    assert.ok(!text.includes("가정통신문") && !text.includes("귀댁에") && !text.includes("교육과정운영"));
    assert.ok(text.includes("2027학년도 2학기") && !text.includes("2025"));
    assert.equal(descendants(doc, "secPr").length, 1, "쪽 설정이 사라졌어요");
    assert.equal(descendants(doc, "pic").length, 0);
    assert.equal(tablesOf(doc).length, 3);
    tablesOf(doc).forEach(assertCovers);
  }
});

test("교과협의록: 칸과 과목 표가 채워진다", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    grade: String((i % 3) + 1), subject: `예시과목${i}`, writer: "출제A", reviewer: "검토B", exam: "1, 2차", method: "추정분할", levels: "5", average: "70",
  }));
  const bytes = await docs.buildMinutes(tpl("minutes"), {
    year: 2027, semester: 1, subjectArea: "과학", exam: 1, dateText: "2027년 4월 14일 수요일 15시 30분", place: "화학실",
    attendees: "가, 나, 다", recorder: "나", rows, remarks: "없음",
  });
  const doc = await sectionOf(bytes);
  const text = allText(doc);
  assert.ok(text.includes("( 과학 )과 회의록"));
  assert.ok(text.includes("2027학년도 1학기 1차 정기시험 원안지 검토 및 분할점수 산출"));
  assert.ok(text.includes("예시과목11") && text.includes("화학실") && text.includes("가, 나, 다"));
  assert.ok(!text.includes("권호중"), "원본 교사 이름이 남아 있어요(템플릿 값 치환 실패)");
  const [, list] = tablesOf(doc);
  assert.equal(list.getAttribute("rowCnt"), "13");
  assertCovers(list);
});

test("붙여넣은 표 읽기", () => {
  const r = parseCutoffText("추정\n독서와 작문\t82.86\t67.86\t52.86\t37.86\n고정\n영미 문학 읽기 90 80 70 60\n한국사 1 2", 0, 4);
  assert.equal(r.groups.length, 2);
  assert.equal(r.groups[0].rows[0].name, "독서와 작문");
  assert.equal(r.groups[1].rows[0].name, "영미 문학 읽기");
  assert.equal(r.errors.length, 1);
  const p = parseCutoffText("추정\n공통국어1 52 52 45 38 28 21", 1, 5);
  assert.equal(p.groups[0].rows[0].lead, "52");
  assert.deepEqual(p.groups[0].rows[0].values, ["52", "45", "38", "28", "21"]);
});
