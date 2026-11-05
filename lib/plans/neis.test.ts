import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { DOMParser as XmlDomParser, XMLSerializer as XmlSerializer } from "@xmldom/xmldom";

Object.assign(globalThis, { DOMParser: XmlDomParser, XMLSerializer: XmlSerializer });

const { extractFromFile } = await import("./extract.ts");
const { guessCutoffKind, looksLikeNeis, neisTexts, parseNeisRows, tidyNumber } = await import("./neis.ts");
const { parseCutoffText } = await import("../hwpx/data.ts");

// 칸 이름(A, B, …)과 글자로 한 줄을 만든다.
const COLS = "ABCDEFGHIJKLMNOP";
const row = (cells: Record<string, string | number>): string[] => {
  const out: string[] = [];
  for (const [k, v] of Object.entries(cells)) out[COLS.indexOf(k)] = String(v);
  return Array.from(out, (x) => x ?? "");
};
const header = () => [
  row({ A: "학년도", B: "학기", C: "과정", D: "계열/학년/학과", E: "편제", F: "과목", G: "지필/수행구분", H: "반영비율", I: "고사/영역", J: "성취수준추정분할점수" }),
  row({ J: "A/B", K: "B/C", L: "C/D", M: "D/E", N: "E/미도달" }),
];

/** NEIS '학기말 추정분할점수 전체교과목' 모양의 가짜 표(2학년: E/미도달 열이 비어 있음). 쪽이 바뀌며 머리글과 과목 이름이 반복된다. */
function fakeGrade2(): string[][] {
  return [
    row({ G: "2026.04.16." }),
    row({ E: "학기말 추정분할점수 전체교과목" }),
    row({ A: "2026학년도   1학기   주간   2학년   일반학과" }),
    ...header(),
    row({ A: "2026.0", E: "가교과", F: "가과목(4)", G: "지필", H: "30.0", I: "1차 정기시험", J: "83.64", K: "68.64", L: "53.64", M: "38.64", N: "" }),
    row({ G: "수행", H: "40.0", I: "[전체영역]", J: "39.0", K: "32.0", L: "25.0", M: "19.0", N: "" }),
    row({ G: "미산출" }),
    row({ E: "나교과", F: "나과목(3)", G: "지필", H: "25.0", I: "1차 정기시험", J: "80.08", K: "65.08", L: "50.08", M: "35.08" }),
    row({ G: "지필", H: "25.0", I: "2차 정기시험", J: "81.5", K: "66.5", L: "51.5", M: "36.5" }),
    row({ G: "수행", H: "50.0", I: "[전체영역]", J: "45.0", K: "43.0", L: "40.0", M: "35.0" }),
    row({ G: "학기말최종추정분할점수", J: "70.0", K: "60.0", L: "50.0", M: "40.0" }),
    row({ F: "다과목(3)", G: "지필", H: "24.0", I: "1차 정기시험", J: "85.76", K: "70.76", L: "55.76", M: "40.76" }),
    // 쪽 바뀜: 바닥글, 날짜, 반복되는 머리글, 같은 과목 이름이 다시 나옴
    row({ J: "1.0", K: "/", M: "2.0", O: "가나다고등학교" }),
    row({ G: "2026.04.16." }),
    ...header(),
    row({ A: "2026.0", E: "가교과", F: "다과목(3)", G: "수행", H: "52.0", I: "[전체영역]", J: "47.0", K: "36.0", L: "26.0", M: "21.0" }),
    row({ G: "미산출" }),
    row({ J: "2.0", K: "/", M: "2.0", O: "가나다고등학교" }),
  ];
}

test("NEIS 표를 알아본다", () => {
  assert.equal(looksLikeNeis(fakeGrade2()), true);
  assert.equal(looksLikeNeis([["과목", "A/B"], ["가", "1"]]), false);
});

test("제목에서 학년도·학기·학년을 읽고, 과목 이름의 단위 수 '(4)'를 뺀다", () => {
  const t = parseNeisRows(fakeGrade2());
  assert.deepEqual([t.year, t.semester, t.grade], [2026, 1, 2]);
  assert.deepEqual(t.subjects.map((s) => s.name), ["가과목", "나과목", "다과목"]);
  assert.deepEqual(t.subjects.map((s) => s.area), ["가교과", "나교과", "나교과"]);
});

test("지필(1차·2차)·수행·학기말최종 줄을 시험별로 모으고, 쪽이 바뀌어도 같은 과목으로 잇는다", () => {
  const [a, b, c] = parseNeisRows(fakeGrade2()).subjects;
  assert.deepEqual(a.first, ["83.64", "68.64", "53.64", "38.64"]); // 2학년은 값 4개(빈 E/미도달 열은 안 씀)
  assert.deepEqual(a.perf, { max: "40", values: ["39", "32", "25", "19"] }); // 반영비율이 수행평가 만점
  assert.equal(a.second, null);
  assert.equal(a.final, null);
  assert.deepEqual(b.second, ["81.5", "66.5", "51.5", "36.5"]);
  assert.deepEqual(b.final, ["70", "60", "50", "40"]);
  assert.equal(c.first?.[0], "85.76");
  assert.deepEqual(c.perf, { max: "52", values: ["47", "36", "26", "21"] }, "다음 쪽의 수행 줄이 같은 과목에 붙어야 해요");
});

test("시험별 붙여넣기 형식 글자가 만들어지고 공지 화면의 해석기로 다시 읽힌다", () => {
  const x = neisTexts(parseNeisRows(fakeGrade2()));
  assert.equal(x.first, ["추정", "가과목\t83.64\t68.64\t53.64\t38.64", "나과목\t80.08\t65.08\t50.08\t35.08", "다과목\t85.76\t70.76\t55.76\t40.76"].join("\n"));
  assert.equal(x.perf.split("\n")[1], "가과목\t40\t39\t32\t25\t19");
  assert.equal(x.term, ["추정", "나과목\t81.5\t66.5\t51.5\t36.5\t70\t60\t50\t40"].join("\n")); // 2차와 최종이 모두 있는 과목만
  assert.deepEqual(parseCutoffText(x.first, 0, 4).errors, []);
  assert.deepEqual(parseCutoffText(x.perf, 1, 4).errors, []);
  assert.deepEqual(parseCutoffText(x.term, 0, 8).errors, []);
});

test("1학년 표는 E/미도달 열까지 값 5개를 읽는다", () => {
  const rows = [
    row({ A: "2026학년도   1학기   주간   1학년   일반학과" }),
    ...header(),
    row({ E: "가교과", F: "가과목1(4)", G: "지필", H: "24.0", I: "1차 정기시험", J: "82.41", K: "67.41", L: "52.41", M: "37.41", N: "19.41" }),
    row({ G: "수행", H: "52.0", I: "[전체영역]", J: "52.0", K: "45.0", L: "38.0", M: "28.0", N: "21.0" }),
  ];
  const t = parseNeisRows(rows);
  assert.equal(t.grade, 1);
  assert.deepEqual(t.subjects[0].first, ["82.41", "67.41", "52.41", "37.41", "19.41"]);
  assert.deepEqual(t.subjects[0].perf, { max: "52", values: ["52", "45", "38", "28", "21"] });
  const x = neisTexts(t);
  assert.deepEqual(parseCutoffText(x.first, 0, 5).errors, []);
  assert.deepEqual(parseCutoffText(x.perf, 1, 5).errors, []);
  assert.equal(x.term, "", "2차 자료가 없으면 비워 둔다");
});

test("숫자 정리와 시험 종류 짐작", () => {
  assert.equal(tidyNumber("52.0"), "52");
  assert.equal(tidyNumber("82.410"), "82.41");
  assert.equal(tidyNumber("0.0"), "0");
  assert.equal(tidyNumber("미산출"), "미산출");
  assert.equal(guessCutoffKind("추정\n가\t1\t2\t3\t4\t5", 1), "first");
  assert.equal(guessCutoffKind("추정\n가\t1\t2\t3\t4\t5\t6", 1), "perf");
  assert.equal(guessCutoffKind(`추정\n가${"\t1".repeat(10)}`, 1), "term");
  assert.equal(guessCutoffKind("추정\n가\t1\t2\t3\t4", 2), "first");
  assert.equal(guessCutoffKind("추정\n가\t1\t2\t3\t4\t5", 2), "perf");
  assert.equal(guessCutoffKind(`추정\n가${"\t1".repeat(8)}`, 3), "term");
  assert.equal(guessCutoffKind("추정\n가\t1\t2", 2), null);
  assert.equal(guessCutoffKind("", 1), null);
});

// 엑셀 파일을 만든다(공유 문자열 사용). 숫자처럼 보이는 칸은 숫자로 저장한다.
async function makeXlsx(rows: string[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  const shared: string[] = [];
  const sheetRows = rows
    .map((r, i) => {
      const cells = r
        .map((v, c) => {
          if (v === "") return "";
          const ref = `${COLS[c]}${i + 1}`;
          if (/^\d+(\.\d+)?$/.test(v) && c >= 9) return `<c r="${ref}"><v>${v}</v></c>`;
          shared.push(v.replace(/&/g, "&amp;"));
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cells}</row>`;
    })
    .join("");
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("엑셀 파일에서 학년·학기와 시험별 표를 한꺼번에 읽는다", async () => {
  const r = await extractFromFile("2학년.xlsx", await makeXlsx(fakeGrade2()));
  assert.equal(r.fileType, "xlsx");
  assert.deepEqual([r.grade, r.year, r.semester], [2, 2026, 1]);
  assert.equal(r.cutoffText, null, "NEIS 표는 시험별로 나눠 읽으므로 한 덩어리 글자는 없어요");
  assert.ok(r.cutoffTexts);
  assert.equal(r.cutoffTexts!.first.split("\n").length, 4);
  assert.equal(r.cutoffTexts!.perf.split("\n").length, 4);
  assert.equal(r.cutoffTexts!.term.split("\n").length, 2);
  assert.deepEqual(r.warnings, []);
});

test("2026학년도 2학기 표기('정기시험/수행평가구분', 구분 값 '정기시험'·'수행평가')의 엑셀도 읽는다", () => {
  const rows = [
    row({ A: "2026학년도   2학기   주간   1학년   일반학과" }),
    row({ A: "학년도", B: "학기", C: "과정", D: "계열/학년/학과", E: "편제", F: "과목", G: "정기시험/수행평가 구분", H: "반영비율", I: "고사/영역", J: "성취수준추정분할점수" }),
    row({ J: "A/B", K: "B/C", L: "C/D", M: "D/E", N: "E/미도달" }),
    row({ E: "가교과", F: "공통가과목2(4)", G: "정기시험", H: "24.0", I: "1차 정기시험", J: "83.04", K: "70.18", L: "55.18", M: "40.18", N: "22.18" }),
    row({ G: "수행평가", H: "52.0", I: "[전체영역]", J: "52.0", K: "49.0", L: "38.0", M: "28.0", N: "21.0" }),
    row({ G: "미산출" }),
  ];
  assert.equal(looksLikeNeis(rows), true);
  const t = parseNeisRows(rows);
  assert.deepEqual([t.year, t.semester, t.grade], [2026, 2, 1]);
  assert.deepEqual(t.subjects[0].first, ["83.04", "70.18", "55.18", "40.18", "22.18"]);
  assert.deepEqual(t.subjects[0].perf, { max: "52", values: ["52", "49", "38", "28", "21"] });
});

