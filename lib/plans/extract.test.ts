import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { DOMParser as XmlDomParser, XMLSerializer as XmlSerializer } from "@xmldom/xmldom";

Object.assign(globalThis, { DOMParser: XmlDomParser, XMLSerializer: XmlSerializer });

const { extractFromFile, fileTypeOf } = await import("./extract.ts");
const docs = await import("../hwpx/docs.ts");
const { parseCutoffText } = await import("../hwpx/data.ts");

const tpl = (name: string) => new Uint8Array(readFileSync(new URL(`../../public/hwpx/${name}.hwpx`, import.meta.url)));

test("파일 이름으로 형식을 알아낸다", () => {
  assert.equal(fileTypeOf("협의록.HWPX"), "hwpx");
  assert.equal(fileTypeOf("a.xlsx"), "xlsx");
  assert.equal(fileTypeOf("a.pdf"), "pdf");
  assert.equal(fileTypeOf("a.hwp"), null);
  assert.equal(fileTypeOf("a.exe"), null);
});

test("협의록 hwpx에서 장소·참석자·기록자를 읽는다", async () => {
  const r = await extractFromFile("협의록.hwpx", tpl("minutes"));
  assert.equal(r.fileType, "hwpx");
  assert.equal(r.minutes?.place, "다목적교실4");
  assert.equal(r.minutes?.recorder, "이창선");
  assert.ok(r.minutes?.attendees.startsWith("권호중, 배숙현") && r.minutes.attendees.endsWith("한은수"), r.minutes?.attendees);
  assert.ok(!r.minutes?.attendees.includes("  "));
});

type Row = { name: string; lead?: string; values: string[] };
const grades = (kind: "first" | "term" | "perf") =>
  ([1, 2, 3] as const).map((grade) => {
    const n = docs.valueCountFor(kind, grade);
    const lead = kind === "perf" ? "52" : undefined;
    const row = (name: string, v: string): Row => ({ name: `${name}${grade}`, lead, values: Array(n).fill(v) });
    return {
      grade,
      groups: [
        { kind: "추정" as const, rows: [row("추정과목A", "80"), row("추정과목B", "70.5")] },
        { kind: "고정" as const, rows: [row("고정과목C", "90"), row("고정과목D", "·")] },
      ],
    };
  });

test("분할점수 hwpx 표에서 붙여넣기 형식 글자를 읽어 와 다시 해석된다(되돌려 읽기)", async () => {
  const date = { year: 2026, month: 11, day: 5 };
  for (const kind of ["first", "term"] as const) {
    const tplName = kind === "term" ? "notice-term" : "notice-written";
    const bytes = await docs.buildNotice(tpl(tplName), { year: 2026, semester: 2, kind, grades: grades(kind), date });
    const r = await extractFromFile("공지.hwpx", bytes);
    const lines = r.cutoffText!.split("\n");
    assert.equal(lines.filter((l) => l === "추정").length, 3, `${kind}: 추정 표시`);
    assert.equal(lines.filter((l) => l === "고정").length, 3, `${kind}: 고정 표시`);
    for (const g of [1, 2, 3]) {
      const n = docs.valueCountFor(kind, g);
      assert.ok(lines.includes(["추정과목A" + g, ...Array(n).fill("80")].join("\t")), `${kind} ${g}학년 추정과목A`);
      assert.ok(lines.includes(["고정과목D" + g, ...Array(n).fill("·")].join("\t")), `${kind} ${g}학년 고정과목D`);
    }
    // 학년마다 값 개수가 다르므로 줄 하나를 골라 해당 학년 값 개수로 해석되는지 본다.
    const sample = ["추정", ...lines.filter((l) => l.startsWith("추정과목A1\t"))].join("\n");
    const parsed = parseCutoffText(sample, 0, docs.valueCountFor(kind, 1));
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.groups[0].rows[0].name, "추정과목A1");
  }
  // 수행평가는 '만점' 칸이 값 앞에 한 칸 더 있다.
  const perf = await docs.buildNotice(tpl("notice-perf"), { year: 2026, semester: 2, kind: "perf", grades: grades("perf"), date });
  const lines = (await extractFromFile("수행.hwpx", perf)).cutoffText!.split("\n");
  assert.ok(lines.includes(["추정과목A1", "52", ...Array(5).fill("80")].join("\t")));
  assert.ok(lines.includes(["추정과목A2", "52", ...Array(4).fill("80")].join("\t")));
});

// 엑셀 파일을 흉내 낸다: 공유 문자열과 인라인 문자열을 함께 쓴다.
async function makeXlsx(rows: (string | number)[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  const shared: string[] = [];
  const colName = (i: number) => String.fromCharCode(65 + i);
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (v === "") return "";
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          if (v.startsWith("inline:")) return `<c r="${ref}" t="inlineStr"><is><t>${v.slice(7)}</t></is></c>`;
          shared.push(v);
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("엑셀에서 협의록 값을 읽는다", async () => {
  const bytes = await makeXlsx([
    ["평가계획서 교과별 협의록"],
    ["일시", "2026. 3. 5.", "장소", "화학실"],
    ["참석자", "가나, 다라, 마바", "기록자", "inline:다라"],
  ]);
  const r = await extractFromFile("협의록.xlsx", bytes);
  assert.deepEqual(r.minutes, { place: "화학실", attendees: "가나, 다라, 마바", recorder: "다라", subjects: [] });
});

test("엑셀에서 분할점수 표를 붙여넣기 형식으로 읽는다", async () => {
  const bytes = await makeXlsx([
    ["과목", "A/B", "B/C", "C/D", "D/E", "E/I"],
    ["추정"],
    ["공통국어2", 83.04, 70.18, 55.18, 40.18, 22.18],
    ["통합과학2", 84.22, 70, 55, 40, 22],
    ["고정"],
    ["통합사회2", 90, 80, 70, 60, 40],
  ]);
  const r = await extractFromFile("분할점수.xlsx", bytes);
  assert.equal(
    r.cutoffText,
    ["추정", "공통국어2\t83.04\t70.18\t55.18\t40.18\t22.18", "통합과학2\t84.22\t70\t55\t40\t22", "고정", "통합사회2\t90\t80\t70\t60\t40"].join("\n"),
  );
  const parsed = parseCutoffText(r.cutoffText!, 0, 5);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.groups.map((g) => [g.kind, g.rows.length]), [["추정", 2], ["고정", 1]]);
});

test("글자를 읽을 수 없는 PDF·파일은 안내를 돌려주고, 지원하지 않는 형식은 거부한다", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await extractFromFile("a.pdf", new Uint8Array([1, 2, 3]), { pdfjs });
  assert.equal(pdf.minutes, null);
  assert.ok(pdf.warnings.length > 0);
  const bad = await extractFromFile("a.xlsx", new Uint8Array([1, 2, 3]));
  assert.ok(bad.warnings.length > 0);
  await assert.rejects(() => extractFromFile("a.exe", new Uint8Array()), /hwpx, xlsx, pdf/);
});
