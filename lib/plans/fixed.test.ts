import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedGroupText, fixedRowValues, namesIn, omitsSubject } from "./fixed.ts";
import type { Course } from "./curriculum.ts";
import type { SubjectPlan } from "./pdf.ts";

const course = (subject: string, levels: Course["levels"]): Course => ({ area: "x", subject, levels, hours: null, credits: null, type: "" });
const plan = (grade: string, subject: string, first: string, second: string): SubjectPlan => ({ grade, subject, first, second, perf: "", method: "고정분할" });

test("고정분할 값: 5단계 90·80·70·60, 3단계 80·60·0··, 1학년만 E/I 칸이 있다", () => {
  assert.deepEqual(fixedRowValues("first", 2, "5"), ["90", "80", "70", "60"]);
  assert.deepEqual(fixedRowValues("first", 2, "3"), ["80", "60", "0", "·"]);
  assert.deepEqual(fixedRowValues("first", 1, "5"), ["90", "80", "70", "60", "40"]);
  assert.deepEqual(fixedRowValues("first", 1, "3"), ["80", "60", "0", "·", "·"]);
});

test("2차·학기말은 2차 정기시험 값 뒤에 학기말 값이 오고, 2차 정기시험만 없으면 그 칸이 -이다", () => {
  assert.deepEqual(fixedRowValues("term", 3, "3"), ["80", "60", "0", "·", "80", "60", "0", "·"]);
  assert.deepEqual(fixedRowValues("term", 3, "3", plan("3", "a", "20%", "")), ["-", "-", "-", "-", "80", "60", "0", "·"]);
  assert.deepEqual(fixedRowValues("term", 1, "5", plan("1", "a", "20%", "20%")), ["90", "80", "70", "60", "40", "90", "80", "70", "60", "40"]);
});

test("협의록에 정기시험이 없는 과목은 뺀다(1차 공지는 1차가 없으면, 2차·학기말 공지는 정기시험이 모두 없으면)", () => {
  assert.equal(omitsSubject("first", undefined), false);
  assert.equal(omitsSubject("first", plan("2", "a", "", "30%")), true);
  assert.equal(omitsSubject("first", plan("2", "a", "30%", "")), false);
  assert.equal(omitsSubject("term", plan("2", "a", "", "30%")), false);
  assert.equal(omitsSubject("term", plan("2", "a", "30%", "")), false);
  assert.equal(omitsSubject("term", plan("2", "a", "", "")), true);
});

test("편제표 과목 중 추정 과목은 빼고 나머지를 고정분할로 채운다(P 과목 제외)", () => {
  const courses = [course("공통국어2", "5"), course("기술·가정", "5"), course("음악", "3"), course("인간과 심리", "")];
  const text = "추정\n공통국어2\t83.04\t70.18\t55.18\t40.18\t22.18";
  const r = fixedGroupText("first", 1, courses, text, new Map());
  assert.equal(r.text, "고정\n기술·가정\t90\t80\t70\t60\t40\n음악\t80\t60\t0\t·\t·");
  assert.equal(r.count, 2);
  assert.equal(r.assumed, 1); // 음악: 협의록이 없어 정기시험을 본다고 가정
});

test("협의록에 정기시험이 없는 과목은 목록에서 빠지고 이름이 돌아온다(띄어쓰기가 달라도 같은 과목)", () => {
  const courses = [course("스포츠 생활1", "3"), course("영어 독해와 작문", "5"), course("음악", "3")];
  const plans = new Map([["2|스포츠생활1", plan("2", "스포츠생활1", "", "")]]);
  const first = fixedGroupText("first", 2, courses, "추정\n영어독해와작문\t1\t2\t3\t4", plans);
  assert.equal(first.text, "고정\n음악\t80\t60\t0\t·");
  assert.deepEqual(first.omitted, ["스포츠 생활1"]);
  assert.equal(first.assumed, 1); // 음악: 협의록이 없어 정기시험을 본다고 가정
  const term = fixedGroupText("term", 2, courses, "추정\n영어독해와작문\t1\t2\t3\t4\t5\t6\t7\t8", plans);
  assert.deepEqual(term.omitted, ["스포츠 생활1"]);
});

test("추정 자료가 없는 학년은 모든 과목이 고정분할이고, 이미 '고정' 줄이 있으면 머리 줄 없이 이어 붙인다", () => {
  const courses = [course("미적분", "5"), course("기하", "3")];
  assert.equal(fixedGroupText("first", 3, courses, "", new Map()).text, "고정\n미적분\t90\t80\t70\t60\n기하\t80\t60\t0\t·");
  assert.equal(fixedGroupText("first", 3, courses, "고정\n미적분\t90\t80\t70\t60", new Map()).text, "기하\t80\t60\t0\t·");
  assert.equal(fixedGroupText("first", 3, [course("기하", "3")], "고정\n기하\t1\t2\t3\t4", new Map()).text, "");
  assert.deepEqual([...namesIn("추정\n독서와 작문\t1\t2")], ["독서와작문"]);
});
