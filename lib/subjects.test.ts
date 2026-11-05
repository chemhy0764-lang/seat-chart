import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, OTHER, SUBJECTS_BY_AREA, canonicalSubject, matchArea, subjectsFor } from "./subjects.ts";

test("모든 교과에 과목 목록 항목이 있다", () => {
  assert.deepEqual(Object.keys(SUBJECTS_BY_AREA).sort(), [...AREAS].sort());
});

test("과목 이름은 비어 있지 않고 한 교과 안에서 겹치지 않으며, 직접 입력과 겹치지 않는다", () => {
  for (const area of AREAS) {
    const list = SUBJECTS_BY_AREA[area];
    assert.ok(list.every((s) => s.trim() !== "" && s === s.trim()), `${area}: 빈 이름이나 앞뒤 공백`);
    assert.equal(new Set(list).size, list.length, `${area}: 겹치는 과목`);
    assert.ok(!list.includes(OTHER));
  }
});

test("교과는 학교에서 쓰는 아홉 가지다", () => {
  assert.deepEqual([...AREAS], ["국어", "영어", "수학", "사회", "과학", "예체능", "기술·가정", "제2외국어·한문", "교양"]);
});

test("교과로 과목 목록을 찾는다", () => {
  assert.ok(subjectsFor("과학").includes("통합과학2"));
  assert.ok(subjectsFor("수학").includes("공통수학1"));
  assert.ok(subjectsFor("예체능").includes("체육1") && subjectsFor("예체능").includes("음악") && subjectsFor("예체능").includes("미술"));
  assert.ok(subjectsFor("제2외국어·한문").includes("일본어Ⅰ") && subjectsFor("제2외국어·한문").includes("한문Ⅰ"));
  assert.deepEqual(subjectsFor("교양"), ["인간과 심리", "인공지능 수학"]);
  assert.deepEqual(subjectsFor("직접 입력"), []);
  assert.deepEqual(subjectsFor(""), []);
});

test("올린 협의록의 교과 이름을 교과 목록에 맞춘다", () => {
  assert.equal(matchArea("사회"), "사회");
  assert.equal(matchArea("제2외국어, 한문"), "제2외국어·한문");
  assert.equal(matchArea("기술·가정"), "기술·가정");
  assert.equal(matchArea("인간과 심리"), "교양"); // 교양 과목 이름이 제목에 쓰인 경우
  assert.equal(matchArea("없는 교과"), "");
  assert.equal(matchArea(""), "");
});

test("올린 협의록의 과목 이름을 목록의 표기에 맞춘다", () => {
  assert.deepEqual(canonicalSubject("영어II", "영어"), { name: "영어Ⅱ", inList: true });
  assert.deepEqual(canonicalSubject("심화 영어I", "영어"), { name: "심화 영어Ⅰ", inList: true });
  assert.deepEqual(canonicalSubject("확률과통계", "수학"), { name: "확률과 통계", inList: true });
  assert.deepEqual(canonicalSubject("한국근현대사", "사회"), { name: "한국근·현대사", inList: true });
  assert.deepEqual(canonicalSubject("일본어회화", "제2외국어·한문"), { name: "일본어 회화", inList: true });
  assert.deepEqual(canonicalSubject("없는과목", "수학"), { name: "없는과목", inList: false });
});

