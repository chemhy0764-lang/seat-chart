// 추정분할점수 표(붙여넣기 형식)의 과목 이름을 올바른 표기로 바로잡는다.
// NEIS PDF·엑셀은 칸 너비에 맞춰 글자 사이를 벌려 놓아 '독서와 작 문', '지구시스 템과학', '미적분 I'처럼 읽힌다.
// 띄어쓰기·로마자 표기를 무시하고 비교해, 알려진 과목 이름(편제표, 고정 목록)이 있으면 그 표기로 바꾼다.
import { SUBJECTS_BY_AREA, nameKey } from "../subjects.ts";

/** 고정 목록의 모든 과목 이름 */
export const STATIC_SUBJECTS: string[] = Object.values(SUBJECTS_BY_AREA).flat();

/** known에서 먼저 나온 이름이 우선한다(편제표 이름을 앞에 두면 편제표 표기가 이긴다). */
export function tidySubjectNames(text: string, known: string[]): string {
  const byKey = new Map<string, string>();
  for (const name of [...known, ...STATIC_SUBJECTS]) if (!byKey.has(nameKey(name))) byKey.set(nameKey(name), name);
  return text
    .split("\n")
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab < 0) return line; // '추정', '고정' 같은 묶음 이름 줄
      const hit = byKey.get(nameKey(line.slice(0, tab)));
      return hit ? hit + line.slice(tab) : line;
    })
    .join("\n");
}
