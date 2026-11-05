import { test } from "node:test";
import assert from "node:assert/strict";
import { examValueOf, parseSubjectsText, subjectsToText } from "./subjectsText.ts";

test("과목 표를 글자로 바꿨다가 되돌려도 같다", () => {
  const subjects = [
    { grade: "1", subject: "가과목", first: "24%", second: "24%", perf: "52%", method: "추정분할" },
    { grade: "3", subject: "나과목", first: "40%", second: "", perf: "60%", method: "고정분할" },
    { grade: "2", subject: "다과목", first: "", second: "", perf: "100%", method: "-" },
  ];
  const text = subjectsToText(subjects);
  assert.equal(text.split("\n")[1], "3\t나과목\t40%\t-\t60%\t고정분할");
  const back = parseSubjectsText(text);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.subjects, subjects);
});

test("잘못된 줄은 줄 번호와 이유를 알려준다", () => {
  const r = parseSubjectsText(["1\t가\t24\t24\t52\t추정분할점수", "4\t나\t-\t-\t100\t고정분할", "1\t다\t120%\t-\t-\t고정분할", "1\t라\t-\t-\t100\t모름", "1\t마\t-", "", "1\t\t-\t-\t100\t고정분할"].join("\n"));
  assert.equal(r.subjects.length, 1);
  assert.equal(r.subjects[0].first, "24%");
  assert.equal(r.subjects[0].method, "추정분할");
  assert.equal(r.errors.length, 5);
  assert.match(r.errors[0], /^2번째 줄: 학년/);
  assert.match(r.errors[1], /^3번째 줄: 비율/);
  assert.match(r.errors[2], /^4번째 줄: 산출방식/);
  assert.match(r.errors[3], /^5번째 줄: .*여섯 칸/);
  assert.match(r.errors[4], /^7번째 줄: 과목 이름/);
});

test("1차·2차 비율로 협의록의 정기시험 칸 값을 정한다", () => {
  assert.equal(examValueOf({ first: "24%", second: "24%" }), "1, 2차");
  assert.equal(examValueOf({ first: "40%", second: "" }), "1차");
  assert.equal(examValueOf({ first: "", second: "40%" }), "2차");
  assert.equal(examValueOf({ first: "", second: "" }), "-");
});
