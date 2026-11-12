// 편제표로 '고정분할' 과목 줄을 만든다. NEIS 추정분할점수 자료에는 추정분할 과목만 있어서, 가정통신문에 모든 과목이
// 들어가려면 편제표의 나머지 과목을 고정분할 묶음으로 채워야 한다.
//
// 고정분할 값은 성취도 단계마다 정해져 있다(학교의 2026학년도 1학기 2차 가정통신문의 고정분할 표와 같다):
//   성취도 5단계: A/B 90, B/C 80, C/D 70, D/E 60, (1학년만 E/I 40)
//   성취도 3단계: A/B 80, B/C 60, C/D 0, D/E ·, (1학년만 E/I ·)
// 정기시험을 보지 않는 과목은 정기시험 칸이 모두 '-'이고 학기말 칸만 값이 있다.
import { nameKey } from "../subjects.ts";
import type { Course } from "./curriculum.ts";
import type { SubjectPlan } from "./pdf.ts";

export type FixedKind = "first" | "term";

const dashes = (n: number): string[] => Array<string>(n).fill("-");

/** 한 과목의 고정분할 값들(1차 문서는 정기시험 값, 2차·학기말 문서는 2차 정기시험 값 뒤에 학기말 값). */
export function fixedRowValues(kind: FixedKind, grade: number, levels: "5" | "3", plan?: SubjectPlan): string[] {
  const full = levels === "5" ? ["90", "80", "70", "60", "40"] : ["80", "60", "0", "·", "·"];
  const base = full.slice(0, grade === 1 ? 5 : 4);
  // 협의록에 반영 비율이 없다고 적힌 시험은 보지 않는 시험이다. 협의록이 없으면 본다고 가정한다.
  const hasExam = plan ? (kind === "first" ? plan.first !== "" : plan.second !== "") : true;
  const exam = hasExam ? base : dashes(base.length);
  return kind === "first" ? exam : [...exam, ...base];
}

/** 붙여넣기 형식 글자에 이미 들어 있는 과목 이름들(비교용 글자). */
export function namesIn(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0) names.add(nameKey(line.slice(0, tab)));
  }
  return names;
}

export type FixedResult = {
  /** 덧붙일 글자('고정' 줄과 과목 줄들). 덧붙일 과목이 없으면 빈 글자 */
  text: string;
  count: number;
  /** 협의록에서 정기시험 실시 여부를 알 수 없어 '본다'고 가정한 3단계 과목 수 */
  assumed: number;
};

/**
 * 편제표 과목 중 성취도 단계가 5·3이고 text에 아직 없는 과목으로 고정분할 줄을 만든다.
 * text에 이미 '고정' 줄이 있으면 그 묶음에 이어 붙이도록 머리 줄 없이 과목 줄만 돌려준다.
 */
export function fixedGroupText(kind: FixedKind, grade: number, courses: Course[], text: string, plans: Map<string, SubjectPlan>): FixedResult {
  const taken = namesIn(text);
  const lines: string[] = [];
  let assumed = 0;
  for (const c of courses) {
    if (c.levels === "") continue; // P 등 성취도로 평가하지 않는 과목은 분할점수가 없다
    const key = nameKey(c.subject);
    if (taken.has(key)) continue;
    taken.add(key);
    const plan = plans.get(`${grade}|${key}`);
    if (!plan && c.levels === "3") assumed++;
    lines.push([c.subject, ...fixedRowValues(kind, grade, c.levels, plan)].join("\t"));
  }
  if (lines.length === 0) return { text: "", count: 0, assumed: 0 };
  const hasFixed = /^\s*고정\s*$/m.test(text);
  return { text: (hasFixed ? "" : "고정\n") + lines.join("\n"), count: lines.length, assumed };
}
