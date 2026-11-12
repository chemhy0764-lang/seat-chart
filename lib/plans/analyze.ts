// 올린 파일 하나가 어떤 자료(교과협의록, 학년별 추정분할점수, 학년별 편제표)인지 알아내고, 저장할 값을 읽는다.
// 여러 파일을 한꺼번에 올릴 때 쓴다. 교과·학년을 파일에서 알아낼 수 없으면 '알아내지 못함'으로 돌려주어 사람이 확인하게 한다.
import { parseCurriculum } from "./curriculum.ts";
import { extractFromFile, fileTypeOf, minutesFromHwpTexts } from "./extract.ts";
import { readHwpTexts } from "./hwp.ts";
import type { PdfJs } from "./pdf.ts";
import { matchArea } from "../subjects.ts";

export type UploadKind = "minutes" | "cutoffs" | "curriculum";

export type Analysis =
  | {
      ok: true;
      kind: UploadKind;
      /** 협의록은 교과, 추정분할점수와 편제표는 학년 */
      scope: string;
      /** 파일에서 읽은 학년도·학기(모르면 null) */
      year: number | null;
      semester: number | null;
      parsed: Record<string, unknown>;
      /** 화면에 보일 짧은 설명 (예: '교과협의록 과학') */
      label: string;
    }
  | { ok: false; reason: string };

export async function analyzeUpload(name: string, bytes: ArrayBuffer | Uint8Array, options: { pdfjs?: PdfJs } = {}): Promise<Analysis> {
  const type = fileTypeOf(name);
  if (!type) return { ok: false, reason: "hwp, hwpx, xlsx, pdf 파일만 올릴 수 있어요." };
  try {
    if (type === "hwp") {
      const texts = await readHwpTexts(bytes);
      const cur = parseCurriculum(texts);
      if (cur.courses.length > 0) {
        if (cur.grade === null) return { ok: false, reason: "편제표로 보이는데 학년을 읽지 못했어요. 편제표 구역에서 올려 주세요." };
        return { ok: true, kind: "curriculum", scope: String(cur.grade), year: cur.year, semester: cur.semester, parsed: { courses: cur.courses }, label: `편제표 ${cur.grade}학년` };
      }
      const m = minutesFromHwpTexts(texts);
      if (!m.place && !m.attendees && !m.recorder) return { ok: false, reason: "편제표나 교과협의록으로 읽지 못했어요(빈 서식이거나 다른 문서예요)." };
      const area = matchArea(m.area);
      if (!area) return { ok: false, reason: "교과협의록인데 제목에서 교과를 읽지 못했어요. 협의록 구역에서 교과를 골라 올려 주세요." };
      return { ok: true, kind: "minutes", scope: area, year: m.year, semester: m.semester, parsed: { place: m.place, attendees: m.attendees, recorder: m.recorder, subjects: [] }, label: `교과협의록 ${area}` };
    }
    const r = await extractFromFile(name, bytes, options);
    if (r.warnings.length > 0 && !r.cutoffTexts && !r.minutes) return { ok: false, reason: r.warnings[0] };
    if (r.cutoffTexts) {
      if (r.grade === null) return { ok: false, reason: "추정분할점수 표로 보이는데 학년을 읽지 못했어요. 추정분할점수 구역에서 올려 주세요." };
      const texts = r.cutoffTexts;
      if (!texts.first.trim() && !texts.perf.trim() && !texts.term.trim()) return { ok: false, reason: "추정분할점수 표에서 과목을 읽지 못했어요." };
      return { ok: true, kind: "cutoffs", scope: String(r.grade), year: r.year, semester: r.semester, parsed: { texts }, label: `추정분할점수 ${r.grade}학년` };
    }
    if (r.minutes && (r.minutes.place || r.minutes.attendees || r.minutes.recorder)) {
      const area = matchArea(r.area);
      if (!area) return { ok: false, reason: "교과협의록으로 보이는데 교과를 읽지 못했어요. 협의록 구역에서 교과를 골라 올려 주세요." };
      return {
        ok: true,
        kind: "minutes",
        scope: area,
        year: r.year,
        semester: r.semester,
        parsed: { place: r.minutes.place, attendees: r.minutes.attendees, recorder: r.minutes.recorder, subjects: r.minutes.subjects ?? [] },
        label: `교과협의록 ${area}`,
      };
    }
    return { ok: false, reason: "어떤 자료인지 알아내지 못했어요. 해당 구역에서 직접 올려 주세요." };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "파일을 읽지 못했어요." };
  }
}
