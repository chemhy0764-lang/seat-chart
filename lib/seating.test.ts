import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitSeats,
  fitSeparations,
  isNear,
  parseRoster,
  rowOf,
  separationConflicts,
  shuffleSeats,
  type Student,
} from "./seating.ts";

const layout = { columns: 3, rows: 7, frontRows: 2 };

function makeStudents(count: number, frontCount: number): Student[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    name: `학생${i}`,
    front: i < frontCount,
  }));
}

test("모든 학생이 정확히 한 번씩 앉는다", () => {
  const students = makeStudents(30, 5);
  for (let run = 0; run < 200; run++) {
    const { seats, warnings } = shuffleSeats(students, layout);
    const placed = seats.filter(Boolean);
    assert.equal(seats.length, 42);
    assert.equal(placed.length, 30);
    assert.equal(new Set(placed).size, 30);
    assert.deepEqual(warnings, []);
  }
});

test("앞줄 우선 학생은 앞 N줄에 앉는다", () => {
  const students = makeStudents(42, 12);
  for (let run = 0; run < 200; run++) {
    const { seats } = shuffleSeats(students, layout);
    students
      .filter((s) => s.front)
      .forEach((s) => assert.ok(rowOf(seats.indexOf(s.id), layout.columns) < layout.frontRows));
  }
});

test("앞줄 우선 학생이 너무 많으면 경고하고 모두 앉힌다", () => {
  const students = makeStudents(20, 15);
  const { seats, warnings } = shuffleSeats(students, layout);
  assert.equal(seats.filter(Boolean).length, 20);
  assert.equal(warnings.length, 1);
});

test("자리보다 학생이 많으면 경고한다", () => {
  const { seats, warnings } = shuffleSeats(makeStudents(45, 0), layout);
  assert.equal(seats.filter(Boolean).length, 42);
  assert.match(warnings[0], /3명 많아요/);
});

test("명단 붙여넣기는 빈 줄을 버리고 기존 학생 설정을 유지한다", () => {
  const existing: Student[] = [{ id: "a", name: "가", front: true }];
  let n = 0;
  const result = parseRoster("가\n\n 나 \r\n다\t", existing, () => `new${n++}`);
  assert.deepEqual(result, [
    { id: "a", name: "가", front: true },
    { id: "new0", name: "나", front: false },
    { id: "new1", name: "다", front: false },
  ]);
});

test("교실 크기를 줄이면 범위 밖 학생은 자리에서 빠진다", () => {
  const students = makeStudents(3, 0);
  const seats = ["s0", null, null, null, null, null, null, "s1", null, null, null, "s2"];
  const next = fitSeats(seats, students, { columns: 2, rows: 2 }, 3);
  assert.deepEqual(next, ["s0", null, null, null, null, "s1", null, null]);
});

test("붙은 자리 판정: 짝·앞뒤·대각선·통로 건너는 붙음, 두 칸 떨어지면 아님", () => {
  // 3분단 = 한 줄 6자리. 0,1 짝 / 2,3 짝 / 4,5 짝
  assert.ok(isNear(0, 1, 3)); // 짝
  assert.ok(isNear(0, 6, 3)); // 바로 뒤
  assert.ok(isNear(0, 7, 3)); // 대각선
  assert.ok(isNear(1, 2, 3)); // 통로 건너 옆
  assert.ok(!isNear(0, 2, 3));
  assert.ok(!isNear(0, 12, 3));
});

test("떨어져 앉을 묶음 학생은 서로 붙어 앉지 않는다", () => {
  for (const [count, fronts] of [[30, 0], [42, 0], [42, 12]]) {
    const students = makeStudents(count, fronts);
    const separations = [["s0", "s1", "s2"], ["s20", "s21"]];
    for (let run = 0; run < 200; run++) {
      const { seats, warnings } = shuffleSeats(students, layout, separations);
      assert.deepEqual(warnings, []);
      assert.equal(separationConflicts(seats, separations, layout.columns).size, 0);
      assert.equal(new Set(seats.filter(Boolean)).size, count);
      students
        .filter((s) => s.front)
        .forEach((s) => assert.ok(rowOf(seats.indexOf(s.id), layout.columns) < layout.frontRows));
    }
  }
});

test("조건을 지킬 수 없으면 경고하고 그래도 모두 앉힌다", () => {
  const tiny = { columns: 1, rows: 1, frontRows: 1 };
  const { seats, warnings } = shuffleSeats(makeStudents(2, 0), tiny, [["s0", "s1"]]);
  assert.equal(seats.filter(Boolean).length, 2);
  assert.match(warnings[0], /찾지 못했어요/);
});

test("규칙 위반 자리를 찾는다", () => {
  const seats = ["s0", "s1", null, null, null, null, null, null, null, null, "s2", null];
  assert.deepEqual([...separationConflicts(seats, [["s0", "s1", "s2"]], 3)].sort(), [0, 1]);
});

test("명단에서 빠진 학생은 묶음에서도 빠진다", () => {
  const students = makeStudents(3, 0);
  assert.deepEqual(fitSeparations([["s0", "s1", "x"], ["s2", "y"]], students), [["s0", "s1"]]);
});
