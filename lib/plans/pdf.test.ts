import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractFromFile } from "./extract.ts";
import { minutesFromPdf, normalizeNames, readPdfPages, subjectFromCells, subjectsFromRows, type PdfItem, type PdfJs } from "./pdf.ts";

const pdfjsLike = pdfjs as unknown as PdfJs;
const fixture = () => new Uint8Array(readFileSync(new URL("./fixtures/fake-minutes.pdf", import.meta.url)));

test("가짜 협의록 PDF에서 교과·학기·장소·참석자·기록자와 반영 비율 표를 읽는다", async () => {
  const m = minutesFromPdf(await readPdfPages(fixture(), pdfjsLike));
  assert.equal(m.area, "시험교과");
  assert.equal(m.year, 2026);
  assert.equal(m.semester, 2);
  assert.match(m.place, /시험실/);
  assert.equal(m.recorder, "라마바");
  assert.equal(m.attendees, "가나다, 라마바, 사아자, 차카타, 파하갑, 나다라, 마바사, 아자차");
  assert.deepEqual(
    m.subjects.map((s) => [s.grade, s.first, s.second, s.perf, s.method]),
    [
      ["1", "24%", "24%", "52%", "추정분할"],
      ["2", "30%", "30%", "40%", "추정분할"],
      ["2", "", "", "100%", "고정분할"],
      ["3", "40%", "", "60%", "고정분할"], // '40'처럼 % 없이 쓴 값
      ["3", "", "", "100%", "-"], // P/F는 분할점수를 쓰지 않음
    ],
  );
  assert.ok(m.subjects.every((s) => !s.subject.includes("%")), "비율이 과목 이름에 섞이면 안 돼요");
  assert.equal(m.subjects.length, 5, "안전교육 표의 줄은 반영 비율 표에 들어오면 안 돼요");
});

test("extractFromFile이 PDF에서 값을 제안한다", async () => {
  const r = await extractFromFile("협의록.pdf", fixture(), { pdfjs: pdfjsLike });
  assert.equal(r.fileType, "pdf");
  assert.equal(r.area, "시험교과");
  assert.deepEqual([r.year, r.semester], [2026, 2]);
  assert.equal(r.minutes?.recorder, "라마바");
  assert.equal(r.minutes?.subjects?.length, 5);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.cutoffText, null);
});

// 실제 협의록처럼 글자 조각을 직접 만들어 위치 규칙을 시험한다(가짜 이름).
const it = (str: string, x: number, y: number, w = 30): PdfItem => ({ str, x, y, w, h: 10 });

test("장소 칸이 이름칸 위아래 두 줄이어도, 참석자가 여러 줄·여러 칸이어도 읽는다", () => {
  const items: PdfItem[] = [
    it("( 예체능 )과 회의록", 195, 792, 178),
    it("일시", 34, 767, 23), it("2026년 9월 3일 목요일 13시 10분", 162, 768, 157),
    it("장소", 430, 768, 21), it("1층 학생부", 489, 776, 49), it("소회의실", 494, 760, 39),
    it("참석자", 28, 734, 35),
    it("가나다", 80, 742, 29), it("라마바", 130, 742, 29), it("사아자", 180, 742, 29),
    it("차카타", 80, 728, 29), it("파하갑", 130, 728, 29),
    it("기록자", 425, 734, 31), it("차카타", 499, 735, 29),
    it("협의주제", 22, 704, 46), it("2026년 예체능과 2학기 교수학습 및 평가 운영 계획 작성 협의", 155, 704, 313),
    // 반영 비율 표: 수행평가 한 칸뿐, 왼쪽 세로 글자('협의')가 같은 높이에 있음
    it("순번", 100, 481), it("학년", 147, 481), it("과목", 229, 481), it("수행평가", 321, 481), it("과목성취도", 422, 481),
    it("협의", 34, 469), it("1", 106, 469), it("1", 153, 469), it("체육2", 227, 469), it("100%", 327, 469), it("고정분할점수", 419, 469),
    it("사항", 34, 457), it("2", 106, 457), it("3", 153, 457), it("음악연주", 227, 457), it("100%", 327, 457), it("고정분할점수", 419, 457),
  ];
  const m = minutesFromPdf([items]);
  assert.equal(m.area, "예체능");
  assert.equal(m.place, "1층 학생부 소회의실");
  assert.equal(m.attendees, "가나다, 라마바, 사아자, 차카타, 파하갑");
  assert.equal(m.recorder, "차카타");
  assert.deepEqual([m.year, m.semester], [2026, 2]);
  assert.deepEqual(
    m.subjects.map((s) => [s.grade, s.subject, s.first, s.second, s.perf, s.method]),
    [["1", "체육2", "", "", "100%", "고정분할"], ["3", "음악연주", "", "", "100%", "고정분할"]],
  );
});

test("이름칸을 찾지 못하면 빈 값으로 두고 표만 읽는다", () => {
  const m = minutesFromPdf([[it("아무 글자", 10, 700)]]);
  assert.deepEqual([m.area, m.place, m.attendees, m.recorder], ["", "", "", ""]);
  assert.deepEqual(m.subjects, []);
});

test("참석자 이름 정리, 표 한 줄 읽기, 표 머리글 판별", () => {
  assert.equal(normalizeNames("가나다 라마바,  사아자 ,차카타"), "가나다, 라마바, 사아자, 차카타");
  assert.deepEqual(subjectFromCells(["3", "2", "동아시아 역사 기행", "20%", "20%", "60%", "추정분할점수"], 3), {
    grade: "2", subject: "동아시아 역사 기행", first: "20%", second: "20%", perf: "60%", method: "추정분할",
  });
  assert.equal(subjectFromCells(["협의", "3", "2", "과목", "40%", "-", "60%", "P/F"], 3)?.method, "-");
  assert.equal(subjectFromCells(["1", "4", "과목", "10%", "추정분할점수"], 1), null, "학년은 1~3");
  assert.equal(subjectFromCells(["x", "1", "과목", "10%", "추정분할점수"], 1), null);
  // 한 표 안에서 다음 표 머리글을 만나면 멈춘다
  const rows = [
    ["순번", "학년", "과목", "1 차 정기시험", "2 차 정기시험", "수행평가", "과목성취도"],
    ["1", "1", "가과목", "24%", "24%", "52%", "추정분할점수"],
    ["순번", "학년", "과목", "안전교육내용", "1학기 시수"],
    ["1", "1", "가과목", "생활안전", "4"],
  ];
  assert.equal(subjectsFromRows(rows).length, 1);
});
