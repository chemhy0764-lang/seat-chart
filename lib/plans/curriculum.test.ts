import { test } from "node:test";
import assert from "node:assert/strict";
import { areasOfGroup, courseNames, coursesToText, findCourse, levelsOfType, parseCoursesText, parseCurriculum } from "./curriculum.ts";
import { readHwpTexts } from "./hwp.ts";
import { fakeHwp } from "./fixtures/fakeHwp.ts";

const TITLE = "학교교육과정 편제 및 시간배당 관리 보고서";
const HEAD = ["순번", "편제명", "시수", "학점", "과목명", "시수", "학점", "성적처리유형", "비고"];
const page = (grade: number, body: string[], n = 1) => [
  "2026.01.01.", TITLE, "", `일반계  ${grade}학년 2학기`, "", ...HEAD, ...body, "1", "가짜고등학교", "/", String(n), "가짜고등학교/2026.01.01 10:00/10.0.0.1/가짜교사",
];
const T5 = "성취도(5단계)+석차등급(5등급)";

test("성적처리유형에서 성취도 단계를 읽는다", () => {
  assert.equal(levelsOfType(T5), "5");
  assert.equal(levelsOfType("성취도(3단계)"), "3");
  assert.equal(levelsOfType("성취도(3단계)(성취도별분포비율)"), "3");
  assert.equal(levelsOfType("P"), "");
});

test("편제명은 앱의 교과로 바꾼다", () => {
  assert.deepEqual(areasOfGroup("...사회(역사/도덕포함)"), ["사회"]);
  assert.deepEqual(areasOfGroup("...기술·가정/정보"), ["기술·가정"]);
  assert.deepEqual(areasOfGroup("...제2외국어/한문"), ["제2외국어·한문"]);
  assert.deepEqual(areasOfGroup("...체육"), ["예체능"]);
  assert.deepEqual(areasOfGroup("....예술"), ["예체능"]);
  assert.deepEqual(areasOfGroup("....기술・가정/제2외국어/한문/교양"), ["기술·가정", "제2외국어·한문", "교양"]);
  assert.deepEqual(areasOfGroup("...정보"), ["정보"]);
});

test("편제표 본문에서 교과별 과목과 성취도 단계를 읽는다(세로 병합·창체·여러 쪽)", () => {
  const first = [
    "1", ".선택중심교육과정", "2", "..보통교과", "560", "35",
    "3", "...국어", "64", "4", "공통국어2", "64", "4", T5, "4",
    "...과학", "64", "4", "통합과학2", "48", "3", T5,
    "5", "과학탐구실험2", "16", "1", "성취도(3단계)",
    "6", "...교양", "48", "3", "인간과 심리", "48", "3", "P",
    "7", "..창의적체험활동", "56", "3",
    "8", "...자율·자치활동", "24", "1", "24", "1", "해당없음",
    "9", "...동아리활동", "16", "1", "16", "1", "해당없음",
  ];
  const second = ["10", "...과학", "64", "4", "물리학", "48", "3", T5];
  const c = parseCurriculum([...page(1, first, 1), ...page(1, second, 2)]);
  assert.equal(c.grade, 1);
  assert.equal(c.semester, 2);
  assert.deepEqual(
    c.courses.map((x) => [x.area, x.subject, x.levels, x.hours, x.credits]),
    [
      ["국어", "공통국어2", "5", 64, 4],
      ["과학", "통합과학2", "5", 48, 3],
      ["과학", "과학탐구실험2", "3", 16, 1],
      ["교양", "인간과 심리", "", 48, 3],
      ["과학", "물리학", "5", 48, 3],
    ],
  );
});

test("한 묶음에 여러 교과가 있으면 과목 이름으로 교과를 정한다", () => {
  const body = ["1", "....기술・가정/제2외국어/한문/교양", "100", "6", "공학 일반", "34", "2", "성취도(3단계)", "2", "일본어Ⅱ", "34", "2", "성취도(3단계)", "3", "인공지능 수학", "34", "2", "성취도(3단계)"];
  const c = parseCurriculum(page(3, body));
  assert.deepEqual(c.courses.map((x) => [x.area, x.subject]), [["기술·가정", "공학 일반"], ["제2외국어·한문", "일본어Ⅱ"], ["교양", "인공지능 수학"]]);
});

test("고칠 수 있는 글자와 서로 바뀐다", () => {
  const c = parseCurriculum(page(1, ["1", "...국어", "64", "4", "공통국어2", "64", "4", T5]));
  const text = coursesToText(c.courses);
  assert.equal(text, `국어\t공통국어2\t5\t64\t4\t${T5}`);
  assert.deepEqual(parseCoursesText(text).courses, c.courses);
  assert.equal(parseCoursesText("국어\t공통국어2").errors.length, 1);
  assert.equal(parseCoursesText("국어\t공통국어2\t4").errors.length, 1);
  assert.deepEqual(parseCoursesText("국어\t문학\t-").courses[0], { area: "국어", subject: "문학", levels: "", hours: null, credits: null, type: "" });
});

test("교과·학년으로 과목 이름을 찾고, 표기가 달라도 같은 과목으로 본다", () => {
  const c = parseCurriculum(page(2, ["1", "...국어", "112", "7", "언어생활 탐구", "48", "3", T5]));
  const byGrade = { "2": c.courses };
  assert.deepEqual(courseNames(byGrade, "국어", "2"), ["언어생활 탐구"]);
  assert.deepEqual(courseNames(byGrade, "국어", ""), ["언어생활 탐구"]);
  assert.deepEqual(courseNames(byGrade, "수학", "2"), []);
  assert.equal(findCourse(byGrade, "2", "국어", "언어생활탐구")?.levels, "5");
  assert.equal(findCourse(byGrade, "1", "국어", "언어생활탐구"), undefined);
});

test("hwp 파일에서 문단 글자를 읽는다(압축 여부와 상관없이)", async () => {
  const texts = ["제목", "일반계  1학년 2학기", "공통국어2"];
  assert.deepEqual(await readHwpTexts(fakeHwp(texts, true)), texts);
  assert.deepEqual(await readHwpTexts(fakeHwp(texts, false)), texts);
});

test("hwp가 아닌 파일은 알아듣기 쉬운 오류", async () => {
  await assert.rejects(readHwpTexts(new Uint8Array([1, 2, 3, 4])), /한글\(hwp\) 파일로 읽지 못했어요/);
});
