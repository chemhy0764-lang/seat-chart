import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { joinTouching, looksLikeNeisPdf, parseNeisPdf } from "./neis-pdf.ts";
import { neisTexts } from "./neis.ts";
import { readPdfPages, type PdfItem, type PdfJs } from "./pdf.ts";
import { extractFromFile } from "./extract.ts";

// 실제 NEIS 출력 PDF의 글자 위치를 본떠(가짜 과목 이름으로) 만든 글자 조각. 칸 안에서 줄바꿈된 글자와
// 여러 줄을 합친 칸 가운데에 놓인 편제·과목 이름까지 같은 모양이다.
const it = (str: string, x: number, y: number, w: number): PdfItem => ({ str, x, y, w, h: 9 });
const VALUE_X = [399, 434, 468, 503, 541];

function header(title: [string, string, string]): PdfItem[] {
  return [
    it("2026.04.16.", 516, 809, 56),
    it("학기말 추정분할점수 전체교과목", 151, 780, 293),
    it(title[0], 26, 758, 53), it(title[1], 88, 758, 26), it("주간", 124, 758, 20), it(title[2], 154, 758, 26), it("일반학과", 190, 758, 40),
    it("성취수준추정분할점수", 438, 738, 90), it("지필/수행", 258, 738, 40),
    it("학년도 학기", 26, 731, 50), it("과정", 85, 731, 18), it("계열/학년/학과", 111, 731, 61), it("편제", 180, 731, 18),
    it("과목", 220, 731, 18), it("반영비율", 306, 731, 36), it("고사/영역", 350, 731, 40), it("구분", 269, 725, 18),
    ...["A/B", "B/C", "C/D", "D/E", "E/미도달"].map((h, i) => it(h, [403, 437, 471, 507, 534][i], 722, 20)),
    it("백영고등학교", 511, 29, 60),
  ];
}
/** 줄 하나: 지필·수행 구분, 반영비율, 고사/영역(두 줄로 나뉨), 값들 */
function line(y: number, kind: string, ratio: string, examLines: string[], values: string[]): PdfItem[] {
  return [
    it(kind, 268, y, 20),
    ...(ratio ? [it(ratio, 312, y, 24)] : []),
    ...examLines.map((t, i) => it(t, 350, y + 6 - i * 14, 36)),
    ...values.map((v, i) => it(v, VALUE_X[i], y + 1, 22)),
  ];
}

/** 1페이지 모양: 과목 두 개. 첫 과목은 4줄(1차·2차·수행·최종), 둘째는 3줄(1차·수행·미산출) */
function page(): PdfItem[] {
  return [
    ...header(["2026학년도", "1학기", "3학년"]),
    ...line(698, "지필", "24.00", ["1차 지필", "평가"], ["82.41", "67.41", "52.41", "37.41"]),
    ...line(663, "지필", "24.00", ["2차 지필", "평가"], ["83.00", "68.00", "53.00", "38.00"]),
    ...line(628, "수행", "52.00", ["[전체영", "역]"], ["50.00", "45.00", "35.00", "21.00"]),
    it("학기말최종추정분할점수", 269, 600, 110), ...["90.00", "80.00", "70.00", "60.00"].map((v, i) => it(v, VALUE_X[i], 600, 22)),
    it("가교과", 179, 652, 20), it("가과목", 209, 659, 40), it("(4)", 221, 645, 17), // 4줄 블록의 가운데
    ...line(560, "지필", "30.00", ["1차 지필", "평가"], ["75.78", "64.41", "53.93", "41.82"]),
    ...line(525, "수행", "40.00", ["[전체영", "역]"], ["36.00", "32.00", "28.00", "24.00"]),
    it("미산출", 268, 497, 30),
    it("영어", 179, 525, 20), it("영어 독해와", 205, 534, 50), it("작문(4)", 215, 521, 30), // 3줄 블록의 가운데
  ];
}

test("NEIS PDF를 알아보고 학년·학기를 읽는다", () => {
  assert.equal(looksLikeNeisPdf([page()]), true);
  assert.equal(looksLikeNeisPdf([[it("( 사회 )과 회의록", 195, 792, 178), it("일시", 34, 767, 23)]]), false);
  const t = parseNeisPdf([page()]);
  assert.deepEqual([t.year, t.semester, t.grade], [2026, 1, 3]);
});

test("칸 안에서 줄바꿈되고 가운데에 놓인 과목·편제 이름과 시험별 값을 읽는다", () => {
  const t = parseNeisPdf([page()]);
  assert.deepEqual(t.subjects.map((s) => [s.name, s.area]), [["가과목", "가교과"], ["영어 독해와 작문", "영어"]]);
  const [a, b] = t.subjects;
  assert.deepEqual(a.first, ["82.41", "67.41", "52.41", "37.41"]); // 3학년은 값 4개
  assert.deepEqual(a.second, ["83", "68", "53", "38"]);
  assert.deepEqual(a.perf, { max: "52", values: ["50", "45", "35", "21"] });
  assert.deepEqual(a.final, ["90", "80", "70", "60"]);
  assert.deepEqual(b.first, ["75.78", "64.41", "53.93", "41.82"]);
  assert.deepEqual(b.perf, { max: "40", values: ["36", "32", "28", "24"] });
  assert.equal(b.second, null);
  assert.equal(b.final, null, "'미산출' 줄은 값이 없다");
  const x = neisTexts(t);
  assert.equal(x.term, ["추정", "가과목\t83\t68\t53\t38\t90\t80\t70\t60"].join("\n"));
});

test("1학년은 E/미도달까지 값 5개를 읽는다", () => {
  const items = [
    ...header(["2026학년도", "1학기", "1학년"]),
    ...line(698, "지필", "24.00", ["1차 지필", "평가"], ["82.41", "67.41", "52.41", "37.41", "19.41"]),
    it("가과목", 209, 690, 40), it("가교과", 179, 690, 20),
  ];
  const t = parseNeisPdf([items]);
  assert.equal(t.grade, 1);
  assert.deepEqual(t.subjects[0].first, ["82.41", "67.41", "52.41", "37.41", "19.41"]);
});

test("쪽이 바뀌어 같은 과목 이름이 다음 쪽에 다시 나와도 하나로 잇는다", () => {
  const p1 = [...header(["2026학년도", "1학기", "3학년"]), ...line(698, "지필", "24.00", ["1차 지필", "평가"], ["82.41", "67.41", "52.41", "37.41"]), it("가과목", 209, 705, 40)];
  const p2 = [...header(["2026학년도", "1학기", "3학년"]), ...line(698, "수행", "52.00", ["[전체영", "역]"], ["50.00", "45.00", "35.00", "21.00"]), it("미산출", 268, 672, 30), it("가과목", 209, 690, 40)];
  const t = parseNeisPdf([p1, p2]);
  assert.equal(t.subjects.length, 1);
  assert.ok(t.subjects[0].first && t.subjects[0].perf);
});

test("글자가 '지필', '/', '수행'처럼 잘게 나뉜 PDF도 이어 붙여 읽는다", () => {
  const split = page().flatMap((i) =>
    i.str === "지필/수행" ? [it("지필", 258, 738, 16), it("/", 274, 738, 4), it("수행", 278, 738, 16)] : [i],
  );
  assert.equal(joinTouching(split).filter((i) => i.str === "지필/수행").length, 1);
  assert.equal(parseNeisPdf([split]).subjects.length, 2);
  // 간격이 넓은 칸끼리는 섞이지 않는다
  assert.equal(joinTouching([it("24.00", 312, 100, 24), it("82.41", 399, 100, 22)]).length, 2);
});

test("협의록 PDF는 NEIS 표가 아니며, extractFromFile이 두 종류 PDF를 구분한다", async () => {
  const pdfjsLike = pdfjs as unknown as PdfJs;
  const minutes = new Uint8Array(readFileSync(new URL("./fixtures/fake-minutes.pdf", import.meta.url)));
  assert.equal(looksLikeNeisPdf(await readPdfPages(minutes, pdfjsLike)), false);
  const r = await extractFromFile("협의록.pdf", minutes, { pdfjs: pdfjsLike });
  assert.equal(r.cutoffTexts, null);
  assert.equal(r.minutes?.recorder, "라마바");
});

test("2026학년도 2학기 표기('정기시험/수행평가' 구분, 값 칸 자리의 '미산출')도 읽는다", () => {
  const items = [
    it("2026.10.15.", 516, 809, 56), it("학기말 추정분할점수", 204, 780, 187),
    it("2026학년도", 26, 758, 53), it("2학기", 88, 758, 26), it("주간", 124, 758, 20), it("1학년", 154, 758, 26), it("일반학과", 190, 758, 40),
    it("성취수준추정분할점수", 438, 738, 90), it("정기시험/수", 259, 737, 38), it("행평가 구분", 259, 726, 37),
    it("학년도 학기", 26, 731, 50), it("과정", 85, 731, 18), it("계열/학년/학과", 111, 731, 61), it("편제", 180, 731, 18),
    it("과목", 220, 731, 18), it("반영비율", 306, 731, 36), it("고사/영역", 350, 731, 40),
    ...["A/B", "B/C", "C/D", "D/E", "E/미도달"].map((h, i) => it(h, [403, 437, 471, 507, 534][i], 722, 20)),
    // 과목 1: 정기시험 줄, 수행평가 줄, 미산출(값 칸 자리)
    ...line(698, "정기시험", "24.00", ["1차 정기", "시험"], ["83.04", "70.18", "55.18", "40.18", "22.18"]),
    ...line(663, "수행평가", "52.00", ["[전체영", "역]"], ["52.00", "49.00", "38.00", "28.00", "21.00"]),
    it("미산출", 399, 635, 30),
    it("공통가과목", 209, 676, 40), it("2(4)", 221, 662, 17), it("가교과", 179, 669, 20),
    // 과목 2
    ...line(607, "정기시험", "25.00", ["1차 정기", "시험"], ["76.11", "62.25", "47.94", "33.98", "14.98"]),
    ...line(572, "수행평가", "50.00", ["[전체영", "역]"], ["49.00", "42.00", "35.00", "28.00", "19.00"]),
    it("미산출", 399, 544, 30),
    it("공통나과목", 209, 585, 40), it("2(4)", 221, 571, 17), it("나교과", 179, 578, 20),
  ];
  assert.equal(looksLikeNeisPdf([items]), true);
  const t = parseNeisPdf([items]);
  assert.deepEqual([t.year, t.semester, t.grade], [2026, 2, 1]);
  assert.deepEqual(t.subjects.map((s) => s.name), ["공통가과목2", "공통나과목2"]);
  assert.deepEqual(t.subjects[0].first, ["83.04", "70.18", "55.18", "40.18", "22.18"]);
  assert.deepEqual(t.subjects[0].perf, { max: "52", values: ["52", "49", "38", "28", "21"] });
  assert.deepEqual(t.subjects[1].first, ["76.11", "62.25", "47.94", "33.98", "14.98"]);
  assert.equal(t.subjects[0].final, null);
  const x = neisTexts(t);
  assert.equal(x.first, ["추정", "공통가과목2\t83.04\t70.18\t55.18\t40.18\t22.18", "공통나과목2\t76.11\t62.25\t47.94\t33.98\t14.98"].join("\n"));
  assert.equal(x.term, "");
});

