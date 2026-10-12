// 자리 배치 규칙: 분단마다 2자리, 0번 줄이 전자칠판 바로 앞.
// seats[row * columns * 2 + col] = 학생 id 또는 null

export type Student = { id: string; name: string; front: boolean };

export type Layout = { columns: number; rows: number; frontRows: number };

export const SEATS_PER_GROUP = 2;

export function seatCount({ columns, rows }: Pick<Layout, "columns" | "rows">) {
  return columns * SEATS_PER_GROUP * rows;
}

export function rowOf(index: number, columns: number) {
  return Math.floor(index / (columns * SEATS_PER_GROUP));
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 떨어져 앉을 학생 묶음. 같은 묶음 학생끼리는 짝이나 앞뒤·옆·대각선 자리에 앉지 않는다.
export type Separation = string[];

// 두 자리가 붙어 있는지 (짝, 앞뒤, 옆, 대각선. 통로 건너 옆자리도 붙은 것으로 본다)
export function isNear(a: number, b: number, columns: number) {
  const width = columns * SEATS_PER_GROUP;
  return (
    Math.abs(Math.floor(a / width) - Math.floor(b / width)) <= 1 &&
    Math.abs((a % width) - (b % width)) <= 1
  );
}

function partnersOf(separations: Separation[]) {
  const partners = new Map<string, Set<string>>();
  for (const group of separations) {
    for (const id of group) {
      const set = partners.get(id) ?? new Set<string>();
      group.forEach((other) => other !== id && set.add(other));
      partners.set(id, set);
    }
  }
  return partners;
}

// 묶음 규칙을 어긴 자리 번호들
export function separationConflicts(
  seats: (string | null)[],
  separations: Separation[],
  columns: number,
): Set<number> {
  const partners = partnersOf(separations);
  const conflicts = new Set<number>();
  seats.forEach((id, a) => {
    if (!id || !partners.has(id)) return;
    seats.forEach((other, b) => {
      if (b > a && other && partners.get(id)!.has(other) && isNear(a, b, columns)) {
        conflicts.add(a);
        conflicts.add(b);
      }
    });
  });
  return conflicts;
}

export type ShuffleResult = { seats: (string | null)[]; warnings: string[] };

const MAX_ATTEMPTS = 500;

export const SEPARATION_WARNING =
  "떨어져 앉을 학생 조건을 모두 지킬 수 있는 배치를 찾지 못했어요. 빨간 칸을 끌어서 직접 옮겨 주세요.";

export function shuffleSeats(
  students: Student[],
  layout: Layout,
  separations: Separation[] = [],
  random: () => number = Math.random,
): ShuffleResult {
  const total = seatCount(layout);
  const frontLimit = Math.min(layout.frontRows, layout.rows) * layout.columns * SEATS_PER_GROUP;
  const ids = new Set(students.map((s) => s.id));
  const partners = partnersOf(separations.map((g) => g.filter((id) => ids.has(id))));
  const warnings: string[] = [];

  const frontCount = students.filter((s) => s.front).length;
  if (frontCount > frontLimit) {
    warnings.push(
      `앞줄 우선 학생(${frontCount}명)이 앞 ${layout.frontRows}줄 자리(${frontLimit}자리)보다 많아서 일부는 뒤쪽에 앉혔어요.`,
    );
  }
  if (students.length > total) {
    warnings.push(
      `학생 수가 자리보다 ${students.length - total}명 많아요. 줄이나 분단을 늘려 주세요.`,
    );
  }

  // 조건이 까다로운 학생부터 앉힌다: 앞줄 우선 → 떨어져 앉을 학생 → 나머지
  const rank = (s: Student) => (s.front ? 0 : 2) + (partners.has(s.id) ? 0 : 1);
  const attempt = (checkSeparation: boolean) => {
    const order = shuffled(students, random).sort((a, b) => rank(a) - rank(b));
    const seats: (string | null)[] = Array(total).fill(null);
    for (const s of order) {
      const free = [...Array(total).keys()].filter((i) => seats[i] === null);
      if (free.length === 0) break;
      const allowed = free.filter(
        (i) =>
          !checkSeparation ||
          !seats.some((other, j) => other && partners.get(s.id)?.has(other) && isNear(i, j, layout.columns)),
      );
      // 앞줄에 빈자리가 남아 있으면 앞줄 우선 학생은 반드시 앞줄에 앉힌다
      const mustFront = s.front && free.some((i) => i < frontLimit);
      const pool = mustFront ? allowed.filter((i) => i < frontLimit) : allowed;
      if (pool.length === 0) return null;
      seats[pool[Math.floor(random() * pool.length)]] = s.id;
    }
    return seats;
  };

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const seats = attempt(true);
    if (seats) return { seats, warnings };
  }
  warnings.push(SEPARATION_WARNING);
  return { seats: attempt(false)!, warnings };
}

// 명단이나 교실 크기가 바뀌었을 때 남아 있는 학생 자리만 유지한다.
export function fitSeats(
  seats: (string | null)[],
  students: Student[],
  layout: Pick<Layout, "columns" | "rows">,
  previousColumns: number,
): (string | null)[] {
  const ids = new Set(students.map((s) => s.id));
  const next: (string | null)[] = Array(seatCount(layout)).fill(null);
  const prevWidth = previousColumns * SEATS_PER_GROUP;
  const width = layout.columns * SEATS_PER_GROUP;
  seats.forEach((id, index) => {
    if (!id || !ids.has(id)) return;
    const row = Math.floor(index / prevWidth);
    const col = index % prevWidth;
    if (row < layout.rows && col < width) next[row * width + col] = id;
  });
  return next;
}

// 붙여넣은 명단을 학생 목록으로 바꾼다. 같은 이름의 기존 학생은 id와 앞줄 설정을 유지한다.
export function parseRoster(
  text: string,
  existing: Student[],
  makeId: () => string = () => crypto.randomUUID(),
): Student[] {
  const pool = [...existing];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, " ").trim())
    .filter(Boolean)
    .slice(0, 72)
    .map((name) => {
      const clipped = name.slice(0, 20);
      const matchIndex = pool.findIndex((s) => s.name === clipped);
      if (matchIndex >= 0) return pool.splice(matchIndex, 1)[0];
      return { id: makeId(), name: clipped, front: false };
    });
}

export function unseated(students: Student[], seats: (string | null)[]) {
  const placed = new Set(seats.filter(Boolean));
  return students.filter((s) => !placed.has(s.id));
}

// 명단에서 빠진 학생을 묶음에서도 지운다. 2명 미만이 된 묶음은 없앤다.
export function fitSeparations(separations: Separation[], students: Student[]): Separation[] {
  const ids = new Set(students.map((s) => s.id));
  return separations.map((g) => [...new Set(g)].filter((id) => ids.has(id))).filter((g) => g.length >= 2);
}
