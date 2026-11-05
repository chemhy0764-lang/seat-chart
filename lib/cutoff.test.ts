import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approxSemester,
  checkPerformance,
  checkRates,
  checkSemester,
  checkTeachers,
  rateToScore,
} from "./cutoff.ts";

const errors = <T extends { severity: string }>(issues: T[]) => issues.filter((i) => i.severity === "error");

test("정상적인 예상정답률은 통과한다", () => {
  assert.deepEqual(checkRates({ A: 85, B: 75, C: 60, D: 45, E: 30 }), []);
});

test("인접 수준 차이가 15%를 넘으면 오류", () => {
  const r = errors(checkRates({ A: 85, B: 65, C: 50, D: 35, E: 20 }));
  assert.equal(r.length, 1);
  assert.match(r[0].message, /A-B 차이가 20%/);
});

test("D와 E의 차이는 19%까지 허용한다", () => {
  assert.deepEqual(errors(checkRates({ A: 85, B: 70, C: 55, D: 40, E: 21 })), []);
  assert.equal(errors(checkRates({ A: 85, B: 70, C: 55, D: 40, E: 20 })).length, 1);
});

test("5% 단위가 아니면 오류, E는 정수면 허용", () => {
  assert.equal(errors(checkRates({ A: 87, B: 75, C: 60, D: 45, E: 27 })).length, 1);
  assert.deepEqual(errors(checkRates({ A: 85, B: 75, C: 60, D: 45, E: 27 })), []);
  assert.equal(errors(checkRates({ A: 85, B: 75, C: 60, D: 45, E: 27.5 })).length, 1);
});

test("5% 미만(E가 0 포함)은 오류", () => {
  const r = errors(checkRates({ A: 85, B: 75, C: 60, D: 45, E: 0 }));
  assert.ok(r.some((i) => /5% 이상/.test(i.message)));
});

test("빈 칸은 오류이고 큰 순서가 아니면 경고", () => {
  assert.equal(errors(checkRates({ A: 85, B: 75 })).length, 3);
  const w = checkRates({ A: 70, B: 75, C: 60, D: 45, E: 30 }).filter((i) => i.severity === "warn");
  assert.equal(w.length, 1);
});

test("공동출제 교사 사이 차이가 15%를 넘으면 오류", () => {
  assert.deepEqual(
    checkTeachers([
      { A: 85, B: 70 },
      { A: 80, B: 65 },
    ]),
    [],
  );
  const r = checkTeachers([{ A: 85 }, { A: 65 }]);
  assert.equal(r.length, 1);
  assert.match(r[0].message, /A: 교사 사이 차이가 20%/);
});

test("성취율을 점수로 바꾸는 값이 안내문 예시와 같다", () => {
  assert.deepEqual([90, 70, 60, 50, 40].map((r) => rateToScore(52, r)), [47, 36, 31, 26, 21]);
  assert.deepEqual([90, 70, 50, 40].map((r) => rateToScore(52, r)), [47, 36, 26, 21]);
});

test("수행평가: E/I 단계 교과는 E가 0이면 오류, 기본점수 초과 필요", () => {
  const base = { max: 52, basic: 20, withI: true };
  assert.deepEqual(
    errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 31, D: 26, E: 21 } })),
    [],
  );
  assert.equal(errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 31, D: 26, E: 0 } })).length, 1);
  assert.equal(errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 31, D: 26, E: 20 } })).length, 1);
});

test("수행평가: 나머지 교과는 E가 0, D가 기본점수 초과", () => {
  const base = { max: 52, basic: 20, withI: false };
  assert.deepEqual(errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 26, D: 21, E: 0 } })), []);
  assert.deepEqual(errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 26, D: 21, E: null } })), []);
  assert.equal(errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 26, D: 20, E: 0 } })).length, 1);
  assert.equal(errors(checkPerformance({ ...base, cuts: { A: 47, B: 36, C: 26, D: 21, E: 5 } })).length, 1);
});

test("수행평가: 소수 분할점수와 만점 초과 검사", () => {
  const base = { max: 50, basic: 10, withI: false };
  assert.deepEqual(errors(checkPerformance({ ...base, cuts: { A: 42.6, B: 35.1, C: 27.6, D: 20.1, E: 0 } })), []);
  assert.equal(errors(checkPerformance({ ...base, cuts: { A: 51, B: 35, C: 27, D: 20, E: 0 } })).length, 1);
});

test("학기말 근사값이 통합과학2 출력본과 1점 안쪽으로 맞는다", () => {
  const got = approxSemester([
    { weight: 24, scale: 100, cuts: [89.31, 74.31, 59.31, 44.31, 25.81] },
    { weight: 24, scale: 100, cuts: [83.99, 68.99, 53.99, 38.99, 20.32] },
    { weight: 52, scale: 52, cuts: [51, 47, 41, 35, 20] },
  ]);
  const expected = [92, 81, 68, 55, 31];
  got.forEach((g, i) => assert.ok(Math.abs(g - expected[i]) < 1, `${i}: ${g} vs ${expected[i]}`));
});

test("학기말 점검: A 분할점수와 A 비율", () => {
  assert.deepEqual(checkSemester({ aCut: 80, average: 70, aRatio: 20, aRatioLimit: 23.9 }), []);
  assert.equal(checkSemester({ aCut: 65, average: 70, aRatio: 20, aRatioLimit: 23.9 }).length, 1);
  assert.equal(checkSemester({ aCut: 80, average: 70, aRatio: 25, aRatioLimit: 23.9 }).length, 1);
});
