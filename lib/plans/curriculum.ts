// NEIS '학교교육과정 편제 및 시간배당 관리 보고서'(학년별 편제표)에서 과목과 성취도 단계를 읽는다.
// 표의 칸 글자가 읽는 순서대로 한 줄씩 들어온다고 보고(hwp 문단), 줄 모양으로 표를 되살린다.
//
// 한 줄(행)은 [순번] [편제명 시수 학점] [과목명 시수 학점 성적처리유형] [비고] 순서이고, 세로로 병합된 칸(교과 이름과 시수)은
// 그 교과의 첫 과목이 있는 행에만 나온다. 창의적체험활동처럼 과목명이 없는 행은 과목 없이 건너뛴다.
import { AREAS, nameKey, subjectsFor } from "../subjects.ts";

export type Course = {
  /** 교과(국어, 수학, …). 아홉 교과에 없는 편제명은 편제표의 이름 그대로 */
  area: string;
  subject: string;
  /** 성취도 단계: '5', '3', 또는 성취도로 평가하지 않는 과목(P 등)은 '' */
  levels: "5" | "3" | "";
  hours: number | null;
  credits: number | null;
  /** 성적처리유형 원문 (예: 성취도(5단계)+석차등급(5등급)) */
  type: string;
};

export type Curriculum = {
  grade: number | null;
  semester: number | null;
  courses: Course[];
};

const TITLE = "학교교육과정 편제 및 시간배당 관리 보고서";
const isInt = (s: string | undefined): s is string => s !== undefined && /^\d+$/.test(s);
const isGroup = (s: string | undefined): s is string => s !== undefined && s.startsWith(".");

/**
 * 편제표의 교과 이름('사회(역사/도덕포함)', '기술·가정/정보', '체육', '예술')이 가리키는 앱의 교과들.
 * 3학년처럼 '기술·가정/제2외국어/한문/교양'을 한 묶음으로 쓰면 여러 교과가 나온다. 모르는 이름은 괄호만 뗀 이름 하나.
 */
export function areasOfGroup(group: string): string[] {
  const name = group.replace(/^\.+/, "").replace(/\([^)]*\)/g, "").replace(/[・･]/g, "·").trim();
  if (name === "체육" || name === "예술") return ["예체능"];
  const parts = name.split("/").map((t) => t.trim());
  const hits = AREAS.filter((a) => (a === "제2외국어·한문" ? parts.some((t) => t === "제2외국어" || t === "한문" || t === a) : parts.includes(a)));
  return hits.length > 0 ? [...hits] : [name];
}

/** 묶음에 교과가 여럿이면 과목 이름이 든 교과로, 목록에 없으면 첫 교과로 정한다. */
function areaOfSubject(candidates: string[], subject: string): string {
  if (candidates.length === 1) return candidates[0];
  return candidates.find((a) => subjectsFor(a).some((s) => nameKey(s) === nameKey(subject))) ?? candidates[0];
}

/** '성취도(5단계)+석차등급(5등급)' → '5', '성취도(3단계)(성취도별분포비율)' → '3', 'P' 등 → '' */
export function levelsOfType(type: string): Course["levels"] {
  const m = /성취도\((\d)단계\)/.exec(type);
  return m && (m[1] === "5" || m[1] === "3") ? m[1] : "";
}

/** 쪽마다 머리글(날짜, 제목, '일반계 1학년 2학기', 칸 이름)과 바닥글(쪽 번호, 학교, '/', 쪽 수, 출력 정보)이 붙는다. */
function pages(tokens: string[]): { head: string[]; body: string[] }[] {
  const starts = tokens.flatMap((t, i) => (t === TITLE ? [i] : []));
  return starts.map((at, n) => {
    let seg = tokens.slice(at + 1, n + 1 < starts.length ? starts[n + 1] : tokens.length);
    const last = seg.lastIndexOf("/");
    if (last >= 2) seg = seg.slice(0, last - 2); // 바닥글: 쪽 번호, 학교 이름, '/', 쪽 수, 출력 정보, (다음 쪽의 날짜)
    const end = seg.indexOf("비고");
    return end < 0 ? { head: seg, body: [] } : { head: seg.slice(0, end + 1), body: seg.slice(end + 1) };
  });
}

export function parseCurriculum(texts: string[]): Curriculum {
  const tokens = texts.map((t) => t.trim()).filter((t) => t !== "");
  const result: Curriculum = { grade: null, semester: null, courses: [] };
  const seen = new Set<string>();
  let areas: string[] = [];

  for (const { head, body } of pages(tokens)) {
    for (const t of head) {
      const m = /(\d)\s*학년\s*(\d)\s*학기/.exec(t);
      if (m) {
        result.grade ??= Number(m[1]);
        result.semester ??= Number(m[2]);
      }
    }
    for (let i = 0; i < body.length; ) {
      if (!isInt(body[i])) {
        i++;
        continue;
      }
      i++; // 순번
      if (isGroup(body[i])) {
        areas = areasOfGroup(body[i]);
        i++;
        if (isInt(body[i]) && isInt(body[i + 1])) i += 2; // 편제 시수, 학점
      }
      if (isInt(body[i]) && isInt(body[i + 1])) {
        i += 2; // 과목명 없이 시수·학점만 있는 행(창의적체험활동)
      } else if (body[i] !== undefined && !isInt(body[i]) && !isGroup(body[i])) {
        const [subject, hours, credits, type] = [body[i], body[i + 1], body[i + 2], body[i + 3]];
        i += isInt(hours) && isInt(credits) ? 3 : 1;
        let typeText = "";
        if (type !== undefined && !isInt(type) && !isGroup(type)) {
          typeText = type;
          i++;
        }
        const area = areaOfSubject(areas.length > 0 ? areas : [""], subject);
        const id = `${area}|${subject}`;
        if (!seen.has(id)) {
          seen.add(id);
          result.courses.push({
            area,
            subject,
            levels: levelsOfType(typeText),
            hours: isInt(hours) ? Number(hours) : null,
            credits: isInt(credits) ? Number(credits) : null,
            type: typeText,
          });
        }
      }
      while (i < body.length && !isInt(body[i])) i++; // 해당없음, 비고 칸
    }
  }
  return result;
}

// ───────── 고칠 수 있는 글자 모양 ─────────
// 한 줄에 교과, 과목, 성취도 단계(5 / 3 / -), 시수, 학점, 성적처리유형을 탭으로 나눠 쓴다. 시수부터는 비워도 된다.

export function coursesToText(courses: Course[]): string {
  return courses
    .map((c) => [c.area, c.subject, c.levels || "-", c.hours ?? "", c.credits ?? "", c.type].join("\t").replace(/\t+$/, ""))
    .join("\n");
}

export function parseCoursesText(text: string): { courses: Course[]; errors: string[] } {
  const courses: Course[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, n) => {
    if (line.trim() === "") return;
    const c = line.split("\t").map((s) => s.trim());
    const at = `${n + 1}번째 줄`;
    if (c.length < 3 || c[0] === "" || c[1] === "") {
      errors.push(`${at}: 교과, 과목, 성취도 단계(5, 3, -)를 탭으로 나눠 쓰세요.`);
      return;
    }
    if (!["5", "3", "-"].includes(c[2])) {
      errors.push(`${at}: 성취도 단계는 5, 3, - 중 하나여야 해요(성취도로 평가하지 않으면 -).`);
      return;
    }
    const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);
    courses.push({
      area: c[0],
      subject: c[1],
      levels: c[2] === "-" ? "" : (c[2] as "5" | "3"),
      hours: num(c[3]),
      credits: num(c[4]),
      type: c[5] ?? "",
    });
  });
  return { courses, errors };
}

/** 편제표의 과목 이름 목록(교과·학년별). 학년이 비면 모든 학년을 합친다. */
export function courseNames(byGrade: Partial<Record<string, Course[]>>, area: string, grade: string): string[] {
  const grades = grade ? [grade] : Object.keys(byGrade).sort();
  const names = grades.flatMap((g) => (byGrade[g] ?? []).filter((c) => c.area === area).map((c) => c.subject));
  return [...new Set(names)];
}

/** 학년·과목 이름(띄어쓰기·로마자 표기가 달라도)으로 편제표의 과목을 찾는다. */
export function findCourse(byGrade: Partial<Record<string, Course[]>>, grade: string, area: string, subject: string): Course | undefined {
  if (!grade || !subject) return undefined;
  return (byGrade[grade] ?? []).find((c) => c.area === area && nameKey(c.subject) === nameKey(subject));
}
