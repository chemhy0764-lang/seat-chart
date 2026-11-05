"use client";

import { useEffect, useState } from "react";
import DropZone from "@/components/DropZone";
import { parseCutoffText } from "@/lib/hwpx/data";
import { valueCountFor, type NoticeKind, type Term } from "@/lib/hwpx/docs";
import { fetchIsAdmin, listPlans, savePlan, signedUrl, type PlanKind, type PlanRow } from "@/lib/plans/api";
import { EXAM_KINDS, EXAM_LABELS } from "@/lib/plans/exams";
import { extractFromFile, fileTypeOf } from "@/lib/plans/extract";
import { guessCutoffKind } from "@/lib/plans/neis";
import type { SubjectPlan } from "@/lib/plans/pdf";
import { parseSubjectsText, subjectsToText } from "@/lib/plans/subjectsText";
import { AREAS, matchArea } from "@/lib/subjects";

const box = "space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5";
const field = "rounded-md border border-gray-300 px-2 py-1";
const primary = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";

const GRADES = ["1", "2", "3"];

export default function PlanFiles({ term }: { term: Term }) {
  const { year, semester } = term;
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Record<PlanKind, PlanRow[]>>({ minutes: [], cutoffs: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [isAdmin, minutes, cutoffs] = await Promise.all([
          fetchIsAdmin(),
          listPlans("minutes", year, semester),
          listPlans("cutoffs", year, semester),
        ]);
        if (!alive) return;
        setAdmin(isAdmin);
        setRows({ minutes, cutoffs });
        setLoadError(null);
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "자료를 불러오지 못했어요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [year, semester, reload]);

  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-semibold">올린 자료 보관</h2>
        <p className="text-sm text-gray-600">
          평가계획서 교과별 협의록과 학년별 추정분할점수 파일을 보관해요. 올린 자료는 지워지지 않고, 정정하면 새 판이 추가돼요(이전
          판은 그대로 남아요). 여기에 올린 자료는 안내·공지 탭에서 불러와 칸을 채우는 데 써요.
        </p>
        <p className={`rounded-md p-2 text-sm ${admin ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-700"}`}>
          {admin === null
            ? "확인하는 중…"
            : admin
              ? `관리자로 로그인했어요. ${year}학년도 ${semester}학기 자료를 올리고 정정할 수 있어요.`
              : "자료는 관리자만 올릴 수 있어요. 올라온 자료는 볼 수 있고 내려받을 수 있어요."}
        </p>
        {loadError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{loadError}</p>}
      </section>
      <PlanSection kind="minutes" term={term} rows={rows.minutes} admin={admin === true} onSaved={() => setReload((n) => n + 1)} />
      <PlanSection kind="cutoffs" term={term} rows={rows.cutoffs} admin={admin === true} onSaved={() => setReload((n) => n + 1)} />
    </div>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function summary(row: PlanRow): string {
  if (row.kind === "minutes") {
    const p = row.parsed as { place?: string; attendees?: string; recorder?: string; subjects?: SubjectPlan[] };
    return [
      p.place && `장소 ${p.place}`,
      p.recorder && `기록자 ${p.recorder}`,
      p.attendees && `참석자 ${p.attendees.split(",").length}명`,
      p.subjects?.length ? `과목 ${p.subjects.length}개` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const texts = ((row.parsed as { texts?: Partial<Record<NoticeKind, string>> }).texts ?? {}) as Partial<Record<NoticeKind, string>>;
  const count = (t?: string) => (t ?? "").split("\n").filter((l) => l.includes("\t")).length;
  return EXAM_KINDS.filter((k) => count(texts[k]) > 0)
    .map((k) => `${EXAM_LABELS[k]} ${count(texts[k])}과목`)
    .join(" · ");
}

type Form = {
  scope: string;
  exam: string;
  file: File | null;
  place: string;
  attendees: string;
  recorder: string;
  /** 협의록의 과목별 반영 비율 표(고칠 수 있는 글자 모양) */
  subjectsText: string;
  /** 추정분할점수: 시험별 표(붙여넣기 형식 글자) */
  texts: Record<NoticeKind, string>;
  note: string;
  base: PlanRow | null;
};

const BLANK_TEXTS: Record<NoticeKind, string> = { first: "", perf: "", term: "" };

const blankForm = (kind: PlanKind): Form => ({
  scope: kind === "minutes" ? "" : "1",
  exam: "",
  file: null,
  place: "",
  attendees: "",
  recorder: "",
  subjectsText: "",
  texts: { ...BLANK_TEXTS },
  note: "",
  base: null,
});

function PlanSection({
  kind,
  term,
  rows,
  admin,
  onSaved,
}: {
  kind: PlanKind;
  term: Term;
  rows: PlanRow[];
  admin: boolean;
  onSaved: () => void;
}) {
  const { year, semester } = term;
  const isMinutes = kind === "minutes";
  const title = isMinutes ? "평가계획서 교과별 협의록" : "학년별 추정분할점수";
  const [form, setForm] = useState<Form>(blankForm(kind));
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // 시험별 표를 학년의 값 개수에 맞춰 검사한다(비어 있는 표는 건너뛴다).
  const parsedTexts = isMinutes
    ? null
    : Object.fromEntries(
        EXAM_KINDS.map((k) => [k, form.texts[k].trim() === "" ? null : parseCutoffText(form.texts[k], k === "perf" ? 1 : 0, valueCountFor(k, Number(form.scope)))]),
      ) as Record<NoticeKind, ReturnType<typeof parseCutoffText> | null>;
  const parsedSubjects = isMinutes ? parseSubjectsText(form.subjectsText) : null;
  const hasPrevious = rows.some((r) => r.scope === form.scope && r.exam === form.exam);
  const label = (r: { scope: string; exam: string }) => (isMinutes ? r.scope : `${r.scope}학년`);

  async function chooseFile(file: File | null, extra?: string) {
    const lead = extra ? [extra] : [];
    set({ file });
    setNotes(lead);
    if (!file) return;
    if (!fileTypeOf(file.name)) {
      setNotes([...lead, "hwpx, xlsx, pdf 파일만 올릴 수 있어요."]);
      set({ file: null });
      return;
    }
    const result = await extractFromFile(file.name, await file.arrayBuffer());
    const found = [...lead, ...result.warnings];
    let scope: string | undefined;
    if (isMinutes && result.area) {
      const area = matchArea(result.area);
      if (area) {
        scope = area;
        found.push(`파일 제목의 교과 '${result.area}'를 '${area}'(으)로 읽어 선택했어요. 맞는지 확인하세요.`);
      } else {
        found.push(`파일 제목의 교과 '${result.area}'를 목록에서 찾지 못했어요. 교과를 직접 선택하세요.`);
      }
    }
    if (result.year && result.semester && (result.year !== year || result.semester !== semester)) {
      found.push(`파일은 ${result.year}학년도 ${result.semester}학기 자료로 보여요. 위에서 고른 ${year}학년도 ${semester}학기와 달라요. 학기를 맞춘 뒤 올려 주세요.`);
    }
    let texts: Record<NoticeKind, string> | undefined;
    if (!isMinutes) {
      if (result.grade) {
        scope = String(result.grade);
        found.push(`NEIS 표에서 ${result.grade}학년으로 읽어 선택했어요.`);
      }
      if (result.cutoffTexts) {
        texts = { ...result.cutoffTexts };
        const filled = EXAM_KINDS.filter((k) => texts![k] !== "").map((k) => EXAM_LABELS[k]);
        found.push(`${filled.join(", ")} 표를 읽었어요. 이 표에는 추정분할 과목만 있어요. 고정분할 과목은 해당 칸에 '고정' 줄을 만들어 직접 넣어 주세요.`);
      } else if (result.cutoffText) {
        const g = Number(scope ?? form.scope);
        const kind = guessCutoffKind(result.cutoffText, g) ?? "first";
        texts = { ...BLANK_TEXTS, [kind]: result.cutoffText };
        found.push(`표의 값 개수로 '${EXAM_LABELS[kind]}' 표로 보고 그 칸에 넣었어요. 아니면 칸을 옮겨 주세요.`);
      } else if (result.fileType === "pdf") {
        found.push("PDF의 분할점수 표는 아직 자동으로 읽지 못해요. 아래 칸에 직접 붙여넣어 주세요(NEIS 엑셀은 읽어요).");
      }
    }
    if (isMinutes && result.minutes && !result.minutes.place && !result.minutes.attendees && !result.minutes.recorder && result.warnings.length === 0) {
      found.push("파일에서 장소, 참석자, 기록자를 찾지 못했어요. 아래에 직접 입력해 주세요.");
    }
    setNotes(found);
    setForm((f) => ({
      ...f,
      file,
      scope: f.base ? f.scope : (scope ?? f.scope),
      place: result.minutes?.place || f.place,
      attendees: result.minutes?.attendees || f.attendees,
      recorder: result.minutes?.recorder || f.recorder,
      subjectsText: result.minutes?.subjects?.length ? subjectsToText(result.minutes.subjects) : f.subjectsText,
      texts: texts ?? f.texts,
    }));
  }

  /** 끌어다 놓거나 고른 파일들. 한 번에 파일 하나만 쓴다. */
  function receiveFiles(files: File[]) {
    if (files.length === 0) return;
    void chooseFile(files[0], files.length > 1 ? `파일이 ${files.length}개라 첫 번째 파일(${files[0].name})만 사용해요. 파일은 하나씩 올려 주세요.` : undefined);
  }

  function startCorrection(row: PlanRow) {
    const p = row.parsed as { place?: string; attendees?: string; recorder?: string; texts?: Partial<Record<NoticeKind, string>>; subjects?: SubjectPlan[] };
    setForm({
      scope: row.scope,
      exam: row.exam,
      file: null,
      place: p.place ?? "",
      attendees: p.attendees ?? "",
      recorder: p.recorder ?? "",
      subjectsText: subjectsToText(p.subjects ?? []),
      texts: { ...BLANK_TEXTS, ...(p.texts ?? {}) },
      note: "",
      base: row,
    });
    setNotes([]);
    setMessage(null);
  }

  const problem = (() => {
    if (!form.scope) return isMinutes ? "교과를 선택하세요." : "학년을 선택하세요.";
    if (!form.file && !form.base) return "올릴 파일을 선택하세요.";
    if (parsedTexts) {
      if (EXAM_KINDS.every((k) => form.texts[k].trim() === "")) return "분할점수 표가 비어 있어요.";
      if (EXAM_KINDS.some((k) => (parsedTexts[k]?.errors.length ?? 0) > 0)) return "분할점수 표의 오류를 먼저 고쳐 주세요.";
    }
    if (parsedSubjects && parsedSubjects.errors.length > 0) return "과목별 반영 비율의 오류를 먼저 고쳐 주세요.";
    if (hasPrevious && form.note.trim() === "") return "이미 올린 자료가 있어요. 정정 사유를 적어 주세요.";
    return null;
  })();

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const parsed = isMinutes
        ? {
            place: form.place.trim(),
            attendees: form.attendees.trim(),
            recorder: form.recorder.trim(),
            subjects: parsedSubjects?.subjects ?? [],
          }
        : { texts: Object.fromEntries(EXAM_KINDS.map((k) => [k, form.texts[k].trim()])) };
      const saved = await savePlan({
        kind,
        scope: form.scope,
        year,
        semester,
        exam: form.exam,
        parsed,
        note: form.note.trim(),
        file: form.file ?? undefined,
        base: form.file ? undefined : (form.base ?? undefined),
      });
      setMessage({ ok: true, text: `${label(saved)} 자료 ${saved.version}판을 저장했어요.` });
      setForm(blankForm(kind));
      setNotes([]);
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function download(row: PlanRow) {
    try {
      const url = await signedUrl(row.file_path, row.file_name);
      // 새 창을 열지 않고 지금 화면에서 파일만 받는다(주소가 '첨부 파일'로 응답하므로 화면은 그대로다).
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "내려받지 못했어요." });
    }
  }

  // 같은 교과(학년·시험)끼리 묶는다. rows는 최신 판이 앞에 온다.
  const groups = new Map<string, PlanRow[]>();
  for (const r of rows) groups.set(`${r.scope}|${r.exam}`, [...(groups.get(`${r.scope}|${r.exam}`) ?? []), r]);

  return (
    <section className={box}>
      <h2 className="font-semibold">
        {title} ({year}학년도 {semester}학기)
      </h2>

      {groups.size === 0 ? (
        <p className="text-sm text-gray-500">아직 올라온 자료가 없어요.</p>
      ) : (
        <div className="space-y-2">
          {[...groups.values()].map((versions) => (
            <div key={`${versions[0].scope}|${versions[0].exam}`} className="rounded-md border border-gray-200 p-2 text-sm">
              <p className="font-semibold">{label(versions[0])}</p>
              {versions.map((r, i) => (
                <div key={r.id} className={`flex flex-wrap items-center gap-2 py-1 ${i > 0 ? "text-gray-500" : ""}`}>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold">{r.version}판{i === 0 ? " (현재)" : ""}</span>
                  <span>{r.file_name}</span>
                  <span className="text-xs text-gray-500">{when(r.uploaded_at)}</span>
                  {summary(r) && <span className="text-xs">{summary(r)}</span>}
                  {r.note && <span className="text-xs text-amber-800">정정 사유: {r.note}</span>}
                  <button className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs" onClick={() => download(r)}>
                    내려받기
                  </button>
                  {admin && (
                    <button className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs" onClick={() => startCorrection(r)}>
                      이 판으로 정정
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {admin && (
        <div className="space-y-2 rounded-md bg-gray-50 p-3 text-sm">
          <p className="font-semibold">{form.base ? `정정: ${label(form.base)} ${form.base.version}판을 바탕으로 새 판 저장` : "새 자료 올리기"}</p>
          <div className="flex flex-wrap items-center gap-3">
            {isMinutes ? (
              <label className="flex items-center gap-1">
                교과
                <select className={field} value={form.scope} disabled={!!form.base} onChange={(e) => set({ scope: e.target.value })}>
                  <option value="">선택</option>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="flex items-center gap-1">
                  학년
                  <select className={field} value={form.scope} disabled={!!form.base} onChange={(e) => set({ scope: e.target.value })}>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}학년
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {form.base && (
              <button className="text-gray-500 underline" onClick={() => setForm(blankForm(kind))}>
                정정 취소
              </button>
            )}
          </div>
          <DropZone file={form.file} accept=".hwpx,.xlsx,.pdf" hint="hwpx, xlsx, pdf · 한 번에 하나" onFiles={receiveFiles} />
          {form.base && !form.file && <p className="text-xs text-gray-500">새 파일을 고르지 않으면 {form.base.file_name} 파일은 그대로 두고 아래 값만 정정해요.</p>}
          {notes.map((n, i) => (
            <p key={i} className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {n}
            </p>
          ))}

          {isMinutes ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-1">
                장소
                <input className={`${field} flex-1`} value={form.place} onChange={(e) => set({ place: e.target.value })} />
              </label>
              <label className="flex items-center gap-1">
                기록자
                <input className={`${field} flex-1`} value={form.recorder} onChange={(e) => set({ recorder: e.target.value })} />
              </label>
              <label className="flex items-center gap-1 sm:col-span-2">
                참석자
                <input className={`${field} flex-1`} placeholder="이름을 쉼표로 구분" value={form.attendees} onChange={(e) => set({ attendees: e.target.value })} />
              </label>
              <div className="space-y-1 sm:col-span-2">
                <p className="text-xs text-gray-600">
                  과목별 정기시험·수행평가 반영 비율이에요. 한 줄에 <b>학년, 과목, 1차, 2차, 수행평가, 산출방식</b>을 탭으로 나눠 쓰고, 실시하지 않으면 -
                  를 써요(산출방식은 추정분할, 고정분할, -). 교과협의록에서 과목 줄을 채우는 데 써요.
                </p>
                <textarea
                  rows={6}
                  className={`${field} w-full font-mono text-xs`}
                  placeholder={"1\t공통수학2\t25%\t25%\t50%\t추정분할"}
                  value={form.subjectsText}
                  onChange={(e) => set({ subjectsText: e.target.value })}
                />
                {parsedSubjects?.errors.map((e, i) => (
                  <p key={i} className="rounded-md bg-red-50 p-1.5 text-xs text-red-800">
                    {e}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                파일에서 읽은 분할점수예요. 공지 탭에 붙여넣는 것과 같은 형식이며(<b>추정</b>/<b>고정</b> 줄, 한 줄에 과목과 값), 시험마다 칸이 달라요. 틀린 곳은 고치고, 해당 없는
                시험은 비워 두세요.
              </p>
              {EXAM_KINDS.map((k) => (
                <div key={k} className="space-y-1">
                  <label className="text-xs font-semibold" htmlFor={`plan-${k}`}>
                    {EXAM_LABELS[k]}
                    <span className="ml-1 font-normal text-gray-500">
                      (한 줄에 {k === "perf" ? "과목, 만점, 값" : "과목, 값"} {valueCountFor(k, Number(form.scope))}개)
                    </span>
                  </label>
                  <textarea
                    id={`plan-${k}`}
                    rows={form.texts[k] ? 6 : 2}
                    className={`${field} w-full font-mono text-xs`}
                    value={form.texts[k]}
                    onChange={(e) => set({ texts: { ...form.texts, [k]: e.target.value } })}
                  />
                  {parsedTexts?.[k]?.errors.map((e, i) => (
                    <p key={i} className="rounded-md bg-red-50 p-1.5 text-xs text-red-800">
                      {e}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}

          <label className="flex items-center gap-1">
            정정 사유
            <input
              className={`${field} flex-1`}
              placeholder={hasPrevious ? "필수: 무엇을 왜 고쳤는지" : "처음 올릴 때는 비워도 돼요"}
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className={primary} disabled={busy || problem !== null} onClick={save}>
              {form.base || hasPrevious ? "새 판으로 저장" : "저장"}
            </button>
            {problem && <span className="text-xs text-gray-500">{problem}</span>}
          </div>
        </div>
      )}
      {message && (
        <p className={`rounded-md p-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{message.text}</p>
      )}
    </section>
  );
}
