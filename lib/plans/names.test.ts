import { test } from "node:test";
import assert from "node:assert/strict";
import { tidySubjectNames } from "./names.ts";

test("PDF에서 벌어진 과목 이름의 띄어쓰기와 로마자 표기를 바로잡는다", () => {
  const bad = ["추정", "독서와 작 문\t82.86\t67.86", "지구시스 템과학\t83.28\t68.28", "역학과 에 너지\t65.03\t53.97", "확률과 통 계\t74.23\t59.82", "미적분 I\t71.43\t59.77", "영어 II\t79.38\t64.38", "세포와 물 질대사\t90.5\t75.5", "고정", "예시교과\t90\t75"].join("\n");
  assert.equal(
    tidySubjectNames(bad, []),
    ["추정", "독서와 작문\t82.86\t67.86", "지구시스템과학\t83.28\t68.28", "역학과 에너지\t65.03\t53.97", "확률과 통계\t74.23\t59.82", "미적분Ⅰ\t71.43\t59.77", "영어Ⅱ\t79.38\t64.38", "세포와 물질대사\t90.5\t75.5", "고정", "예시교과\t90\t75"].join("\n"),
  );
});

test("편제표의 표기가 고정 목록보다 먼저다", () => {
  assert.equal(tidySubjectNames("언어생활탐구\t77.53", ["언어생활 탐구"]), "언어생활 탐구\t77.53");
  assert.equal(tidySubjectNames("언어생활 탐 구\t77.53", []), "언어생활탐구\t77.53");
});

test("모르는 이름과 perf 줄의 만점 칸은 그대로 둔다", () => {
  assert.equal(tidySubjectNames("새 과목\t52\t40", []), "새 과목\t52\t40");
});
