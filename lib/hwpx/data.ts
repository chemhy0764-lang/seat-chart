// 엑셀 등에서 붙여넣은 분할점수 표를 읽는다.
// 한 줄에 "교과 값 값 값 ..." (탭 또는 공백), 줄 하나가 "추정" 또는 "고정"이면 묶음이 바뀐다.

export type GroupKind = "추정" | "고정";
export type ParsedRow = { name: string; lead?: string; values: string[] };
export type ParsedGroup = { kind: GroupKind; rows: ParsedRow[] };
export type ParseResult = { groups: ParsedGroup[]; errors: string[] };

const VALUE = /^(?:\d+(?:\.\d+)?|[-–·․.])$/;

/**
 * @param leadCount 값 앞에 붙는 칸 수(수행평가의 만점은 1)
 * @param valueCount 값 칸 수(예: 정기시험 4 또는 5, 2차+학기말 8 또는 10)
 */
export function parseCutoffText(text: string, leadCount: number, valueCount: number): ParseResult {
  const groups: ParsedGroup[] = [];
  const errors: string[] = [];
  let current: ParsedGroup | null = null;
  const need = leadCount + valueCount;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const marker = line.replace(/[\[\]\s]/g, "");
    if (marker === "추정" || marker === "고정") {
      current = { kind: marker, rows: [] };
      groups.push(current);
      return;
    }
    const tokens = (line.includes("\t") ? line.split(/\t+/) : line.split(/\s+/)).map((t) => t.trim()).filter(Boolean);
    if (tokens.length < need + 1) {
      errors.push(`${i + 1}번째 줄: 교과 이름과 값 ${need}개가 필요해요(값 ${tokens.length - 1}개 확인).`);
      return;
    }
    const nums = tokens.slice(tokens.length - need);
    const name = tokens.slice(0, tokens.length - need).join(" ");
    const bad = nums.find((t) => !VALUE.test(t));
    if (bad !== undefined) {
      errors.push(`${i + 1}번째 줄: '${bad}'은(는) 숫자나 -, · 가 아니에요.`);
      return;
    }
    if (!current) {
      errors.push(`${i + 1}번째 줄: 먼저 '추정' 또는 '고정' 줄을 쓰세요.`);
      return;
    }
    current.rows.push({
      name,
      lead: leadCount ? nums[0] : undefined,
      values: nums.slice(leadCount),
    });
  });

  return { groups: groups.filter((g) => g.rows.length > 0), errors };
}
