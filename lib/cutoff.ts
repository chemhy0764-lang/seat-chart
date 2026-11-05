// 분할점수 입력값 검증과 학기말 근사 계산.
// 규칙의 출처는 NEIS 분할점수 산출 안내문(2025~2026학년도)이다.
// NEIS 내부 산출식은 공개되어 있지 않으므로, 이 파일은 "입력 검증"과 "근사값"만 다룬다.

export type Level = "A" | "B" | "C" | "D" | "E";
export const LEVELS: Level[] = ["A", "B", "C", "D", "E"];

export type Issue = { severity: "error" | "warn"; message: string };
export type Rates = Partial<Record<Level, number | null>>;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 정기시험 최소능력자 예상정답률(%) 한 줄(한 교사, 한 라운드)을 검사한다. */
export function checkRates(rates: Rates): Issue[] {
  const issues: Issue[] = [];
  const values: Partial<Record<Level, number>> = {};

  for (const level of LEVELS) {
    const v = rates[level];
    if (!isNum(v)) {
      issues.push({ severity: "error", message: `${level} 수준 예상정답률을 입력하세요.` });
      continue;
    }
    values[level] = v;
    if (v < 5) {
      issues.push({ severity: "error", message: `${level}: 정기시험은 5% 이상으로 입력해야 해요.` });
    } else if (v > 100) {
      issues.push({ severity: "error", message: `${level}: 100%를 넘을 수 없어요.` });
    }
    if (level === "E") {
      if (!Number.isInteger(v)) {
        issues.push({ severity: "error", message: "E: 정수 단위로 입력하세요(5% 단위가 아니어도 돼요)." });
      }
    } else if (v % 5 !== 0) {
      issues.push({ severity: "error", message: `${level}: 5% 단위로 입력하세요.` });
    }
  }

  for (let i = 0; i < LEVELS.length - 1; i++) {
    const upper = LEVELS[i];
    const lower = LEVELS[i + 1];
    const u = values[upper];
    const l = values[lower];
    if (u === undefined || l === undefined) continue;
    if (u <= l) {
      issues.push({
        severity: "warn",
        message: `${upper}(${u})가 ${lower}(${l})보다 크지 않아요. 안내문에 명시된 규칙은 아니지만 확인하세요.`,
      });
    }
    const limit = lower === "E" ? 19 : 15;
    const diff = u - l;
    if (diff > limit) {
      issues.push({
        severity: "error",
        message:
          lower === "E"
            ? `${upper}-${lower} 차이가 ${diff}%예요. D와 E의 차이는 19%까지 입력할 수 있어요.`
            : `${upper}-${lower} 차이가 ${diff}%예요. 인접 수준 차이는 15% 이하여야 해요(20% 이상이면 마감 후 산출 불가).`,
      });
    }
  }
  return issues;
}

/** 공동출제 과목: 같은 수준의 예상정답률이 교사 사이에 15% 이하로 차이 나는지 검사한다. */
export function checkTeachers(teachers: Rates[]): Issue[] {
  const issues: Issue[] = [];
  if (teachers.length < 2) return issues;
  for (const level of LEVELS) {
    const vs = teachers.map((t) => t[level]).filter(isNum);
    if (vs.length < 2) continue;
    const spread = Math.max(...vs) - Math.min(...vs);
    if (spread > 15) {
      issues.push({
        severity: "error",
        message: `${level}: 교사 사이 차이가 ${spread}%예요. 15% 이하여야 해요. 입력 전에 협의하세요.`,
      });
    }
  }
  return issues;
}

/** 성취율(%)을 점수로 바꾼다. 안내문 예시처럼 정수로 반올림한다. */
export function rateToScore(max: number, rate: number): number {
  return Math.round((max * rate) / 100);
}

export type PerfCuts = Record<Level, number | null>;

export type PerfInput = {
  max: number;
  /** 수행평가 기본점수 */
  basic: number;
  /** E/I(미도달) 단계를 쓰는 교과인가. 안내문은 학년 기준으로 적혀 있고 연도마다 다르다. */
  withI: boolean;
  cuts: PerfCuts;
};

/** 수행평가 성취수준별 추정분할점수를 검사한다. 소수 입력도 허용된다. */
export function checkPerformance({ max, basic, withI, cuts }: PerfInput): Issue[] {
  const issues: Issue[] = [];
  if (!isNum(max) || max <= 0) {
    return [{ severity: "error", message: "수행평가 만점을 입력하세요." }];
  }
  const levels = withI ? LEVELS : LEVELS.filter((l) => l !== "E");
  const present: Partial<Record<Level, number>> = {};

  for (const level of levels) {
    const v = cuts[level];
    if (!isNum(v)) {
      issues.push({ severity: "error", message: `${level} 분할점수를 입력하세요.` });
      continue;
    }
    present[level] = v;
    if (v < 0 || v > max) {
      issues.push({ severity: "error", message: `${level}: 0 이상 만점(${max}) 이하여야 해요.` });
    }
  }

  for (let i = 0; i < levels.length - 1; i++) {
    const u = present[levels[i]];
    const l = present[levels[i + 1]];
    if (u !== undefined && l !== undefined && u <= l) {
      issues.push({
        severity: "warn",
        message: `${levels[i]}(${u})가 ${levels[i + 1]}(${l})보다 크지 않아요.`,
      });
    }
  }

  if (withI) {
    const e = present.E;
    if (e !== undefined) {
      if (e === 0) {
        issues.push({ severity: "error", message: "E/I 단계를 쓰는 교과는 E를 0으로 둘 수 없어요(성취율 40%를 곱해 입력)." });
      } else if (e <= basic) {
        issues.push({ severity: "error", message: `E 점수는 수행평가 기본점수(${basic})를 초과해야 해요.` });
      }
    }
  } else {
    if (isNum(cuts.E) && cuts.E !== 0) {
      issues.push({ severity: "error", message: "이 교과는 E를 0으로 입력해야 해요." });
    }
    const d = present.D;
    if (d !== undefined && d <= basic) {
      issues.push({ severity: "error", message: `D 점수는 수행평가 기본점수(${basic})를 초과해야 해요.` });
    }
  }
  return issues;
}

export type Part = {
  /** 학기말 성적에서 이 평가가 차지하는 반영비율(%) */
  weight: number;
  /** 이 평가의 만점. 정기시험은 100(NEIS가 100점 기준으로 환산), 수행평가는 수행 만점. */
  scale: number;
  /** A/B, B/C, C/D, D/E, (E/I) 분할점수 */
  cuts: number[];
};

/**
 * 학기말 분할점수 근사값: 각 평가의 분할점수를 (분할점수 / 만점 × 반영비율)로 환산해 더한다.
 * 2025학년도 통합과학2 출력본과 1점 안쪽으로 맞았으나, NEIS의 정확한 반올림 규칙은 확인되지 않았다.
 */
export function approxSemester(parts: Part[]): number[] {
  const n = Math.max(0, ...parts.map((p) => p.cuts.length));
  return Array.from({ length: n }, (_, i) =>
    parts.reduce((sum, p) => sum + ((p.cuts[i] ?? 0) / p.scale) * p.weight, 0),
  );
}

export type SemesterInput = {
  aCut: number;
  average: number;
  /** A 수준 학생 비율(%) */
  aRatio: number;
  /** A 비율 상한(%). 안내문이 학기마다 달라 입력으로 받는다(예: 32.8, 23.9). */
  aRatioLimit: number;
};

/** 학기말 점검: A 분할점수는 과목 평균 이상, A 비율은 상한 이하. */
export function checkSemester({ aCut, average, aRatio, aRatioLimit }: SemesterInput): Issue[] {
  const issues: Issue[] = [];
  if (aCut < average) {
    issues.push({ severity: "error", message: `A 분할점수(${aCut})가 과목 평균(${average})보다 낮아요.` });
  }
  if (aRatio > aRatioLimit) {
    issues.push({ severity: "error", message: `A 비율 ${aRatio}%가 상한 ${aRatioLimit}%보다 높아요.` });
  }
  return issues;
}
