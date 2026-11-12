import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeUpload } from "./analyze.ts";
import { fakeHwp } from "./fixtures/fakeHwp.ts";

const TITLE = "학교교육과정 편제 및 시간배당 관리 보고서";
const HEAD = ["순번", "편제명", "시수", "학점", "과목명", "시수", "학점", "성적처리유형", "비고"];
const curriculum = (grade: number) => [
  "2026.01.01.", TITLE, `일반계  ${grade}학년 2학기`, ...HEAD,
  "1", "...국어", "64", "4", "공통국어2", "64", "4", "성취도(5단계)+석차등급(5등급)",
  "1", "가짜고등학교", "/", "1", "가짜고등학교/2026.01.01 10:00/10.0.0.1/가짜교사",
];
const minutes = (title: string) => [title, "일시", "2025년 9월 11일", "장소", "가상실", "참석자", "가나다, 라마바", "기록자", "라마바", "협의주제", "2025학년도 2학기 1차 지필평가", "협   의", "사   항"];

test("hwp 편제표는 학년과 과목으로 알아낸다", async () => {
  const a = await analyzeUpload("편제표.hwp", fakeHwp(curriculum(2), true));
  assert.ok(a.ok);
  assert.equal(a.kind, "curriculum");
  assert.equal(a.scope, "2");
  assert.equal(a.year, 2026); // 출력한 날짜(2026.01.01.)에서
  assert.equal(a.semester, 2);
  assert.deepEqual((a.parsed.courses as { subject: string }[]).map((c) => c.subject), ["공통국어2"]);
});

test("hwp 교과협의록은 제목의 교과와 장소·참석자·기록자로 알아낸다", async () => {
  const a = await analyzeUpload("협의록.hwp", fakeHwp(minutes("( 과학 )과 회의록"), true));
  assert.ok(a.ok);
  assert.equal(a.kind, "minutes");
  assert.equal(a.scope, "과학");
  assert.equal(a.year, 2025);
  assert.equal(a.semester, 2);
  assert.deepEqual(a.parsed, { place: "가상실", attendees: "가나다, 라마바", recorder: "라마바", subjects: [] });
});

test("알아낼 수 없는 파일은 이유와 함께 건너뛴다", async () => {
  const blank = await analyzeUpload("빈서식.hwp", fakeHwp(["( 00 )과 회의록", "일시", "장소", "참석자", "기록자", "협   의", "사   항"], true));
  assert.equal(blank.ok, false);
  const noArea = await analyzeUpload("교과없음.hwp", fakeHwp(minutes("( 00 )과 회의록"), true));
  assert.equal(noArea.ok, false);
  assert.match(!noArea.ok ? noArea.reason : "", /교과를 읽지 못했어요/);
  const other = await analyzeUpload("메모.hwp", fakeHwp(["아무 문서", "내용"], true));
  assert.equal(other.ok, false);
  const exe = await analyzeUpload("a.exe", new Uint8Array([1, 2, 3]));
  assert.equal(exe.ok, false);
  const broken = await analyzeUpload("깨짐.hwp", new Uint8Array([1, 2, 3, 4]));
  assert.equal(broken.ok, false);
});
