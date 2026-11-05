import type { SubjectPlan } from "./pdf.ts";

// 협의록의 과목별 반영 비율을 화면에서 고칠 수 있는 글자 모양으로 바꾸고 되돌린다.
// 한 줄: 학년 ⇥ 과목 ⇥ 1차 ⇥ 2차 ⇥ 수행평가 ⇥ 산출방식(추정분할·고정분할·-)

export const SUBJECT_HEADER = "학년\t과목\t1차\t2차\t수행평가\t산출방식";

export function subjectsToText(subjects: SubjectPlan[]): string {
  return subjects.map((s) => [s.grade, s.subject, s.first || "-", s.second || "-", s.perf || "-", s.method].join("\t")).join("\n");
}

const percent = (t: string): string | null => {
  const v = t.trim();
  if (v === "" || v === "-" || v === "–" || /미실시/.test(v)) return "";
  const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(v);
  return m && Number(m[1]) <= 100 ? `${m[1]}%` : null;
};

export function parseSubjectsText(text: string): { subjects: SubjectPlan[]; errors: string[] } {
  const subjects: SubjectPlan[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === "" || raw.trim() === SUBJECT_HEADER.trim()) return;
    const cells = raw.split("\t").map((c) => c.trim());
    if (cells.length < 6) {
      errors.push(`${i + 1}번째 줄: 학년, 과목, 1차, 2차, 수행평가, 산출방식 여섯 칸이 필요해요(탭으로 나눠 주세요).`);
      return;
    }
    const [grade, subject, first, second, perf, method] = cells;
    if (!/^[1-3]$/.test(grade)) {
      errors.push(`${i + 1}번째 줄: 학년은 1, 2, 3 중 하나여야 해요('${grade}').`);
      return;
    }
    if (subject === "") {
      errors.push(`${i + 1}번째 줄: 과목 이름이 비어 있어요.`);
      return;
    }
    const f = percent(first);
    const s = percent(second);
    const p = percent(perf);
    if (f === null || s === null || p === null) {
      errors.push(`${i + 1}번째 줄: 비율은 24 또는 24% 처럼 쓰고, 실시하지 않으면 - 로 써 주세요.`);
      return;
    }
    const m = /추정/.test(method) ? "추정분할" : /고정/.test(method) ? "고정분할" : method === "-" || method === "" ? "-" : null;
    if (m === null) {
      errors.push(`${i + 1}번째 줄: 산출방식은 추정분할, 고정분할, - 중 하나로 써 주세요('${method}').`);
      return;
    }
    subjects.push({ grade, subject, first: f, second: s, perf: p, method: m });
  });
  return { subjects, errors };
}

/** 1차·2차 반영 비율이 있는지에 따라 협의록의 '정기시험' 칸 값. */
export function examValueOf(s: Pick<SubjectPlan, "first" | "second">): string {
  if (s.first && s.second) return "1, 2차";
  if (s.first) return "1차";
  if (s.second) return "2차";
  return "-";
}
