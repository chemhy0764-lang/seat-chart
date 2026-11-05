import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, OTHER, SUBJECTS_BY_AREA, subjectsFor } from "./subjects.ts";

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

test("교과로 과목 목록을 찾는다", () => {
  assert.ok(subjectsFor("과학").includes("통합과학2"));
  assert.ok(subjectsFor("수학").includes("공통수학1"));
  assert.deepEqual(subjectsFor("정보"), []);
  assert.deepEqual(subjectsFor("직접 입력"), []);
  assert.deepEqual(subjectsFor(""), []);
});
