"use client";

import { useEffect, useState } from "react";
import DropZone from "@/components/DropZone";
import type { Term } from "@/lib/hwpx/docs";
import { fetchIsAdmin, listPlans, savePlan, signedUrl, type PlanRow } from "@/lib/plans/api";
import { coursesToText, parseCoursesText, parseCurriculum, type Course } from "@/lib/plans/curriculum";
import { readHwpTexts } from "@/lib/plans/hwp";

const box = "space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5";
const field = "rounded-md border border-gray-300 px-2 py-1";
const primary = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const GRADES = ["1", "2", "3"];

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const coursesOf = (row: PlanRow): Course[] => {
  const c = (row.parsed as { courses?: Course[] }).courses;
  return Array.isArray(c) ? c : [];
};

/** 교과별 과목 수 요약 (예: 국어 2 · 수학 3) */
function summary(courses: Course[]): string {
  const counts = new Map<string, number>();
  for (const c of courses) counts.set(c.area, (counts.get(c.area) ?? 0) + 1);
  return [...counts].map(([a, n]) => `${a} ${n}`).join(" · ");
}

type Form = { scope: string; file: File | null; text: string; note: string; base: PlanRow | null };
const blank = (): Form => ({ scope: "1", file: null, text: "", note: "", base: null });

/** 학년별 편제표(NEIS '학교교육과정 편제 및 시간배당 관리 보고서', hwp)를 올리는 탭. 관리자만 올리고, 정정은 새 판으로 남긴다. */
export default function CurriculumFiles({ term, embedded = false }: { term: Term; embedded?: boolean }) {
  const { year, semester } = term;
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<Form>(blank());
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [isAdmin, list] = await Promise.all([fetchIsAdmin(), listPlans("curriculum", year, semester)]);
        if (!alive) return;
        setAdmin(isAdmin);
        setRows(list);
        setLoadError(null);
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "자료를 불러오지 못했어요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [year, semester, reload]);

  const parsedText = parseCoursesText(form.text);
  const hasPrevious = rows.some((r) => r.scope === form.scope);

  async function chooseFile(file: File | null, lead?: string) {
    set({ file });
    setNotes(lead ? [lead] : []);
    if (!file) return;
    if (!/\.hwp$/i.test(file.name)) {
      setNotes([...(lead ? [lead] : []), "편제표는 NEIS에서 받은 hwp 파일을 올려 주세요(hwpx, pdf, xlsx는 아직 읽지 못해요)."]);
      set({ file: null });
      return;
    }
    const found = lead ? [lead] : [];
    try {
      const cur = parseCurriculum(await readHwpTexts(await file.arrayBuffer()));
      if (cur.courses.length === 0) {
        found.push("파일에서 과목을 찾지 못했어요. NEIS '학교교육과정 편제 및 시간배당 관리 보고서'가 맞는지 확인하거나, 아래 칸에 직접 써 주세요.");
      } else {
        found.push(`${cur.courses.length}개 과목을 읽었어요(${summary(cur.courses)}). 맞는지 확인하세요.`);
      }
      if (cur.semester && cur.semester !== semester) {
        found.push(`파일은 ${cur.semester}학기 편제표로 보여요. 위에서 고른 ${year}학년도 ${semester}학기와 달라요. 학기를 맞춘 뒤 올려 주세요.`);
      }
      if (cur.grade) found.push(`${cur.grade}학년으로 읽어 선택했어요.`);
      setNotes(found);
      setForm((f) => ({ ...f, file, scope: f.base ? f.scope : cur.grade ? String(cur.grade) : f.scope, text: cur.courses.length > 0 ? coursesToText(cur.courses) : f.text }));
    } catch (e) {
      found.push(e instanceof Error ? e.message : "파일을 읽지 못했어요.");
      setNotes(found);
    }
  }

  function receiveFiles(files: File[]) {
    if (files.length === 0) return;
    void chooseFile(files[0], files.length > 1 ? `파일이 ${files.length}개라 첫 번째 파일(${files[0].name})만 사용해요. 파일은 하나씩 올려 주세요.` : undefined);
  }

  function startCorrection(row: PlanRow) {
    setForm({ scope: row.scope, file: null, text: coursesToText(coursesOf(row)), note: "", base: row });
    setNotes([]);
    setMessage(null);
  }

  const problem = (() => {
    if (!form.file && !form.base) return "올릴 파일을 선택하세요.";
    if (form.text.trim() === "") return "과목이 비어 있어요.";
    if (parsedText.errors.length > 0) return "과목 표의 오류를 먼저 고쳐 주세요.";
    if (hasPrevious && form.note.trim() === "") return "이미 올린 자료가 있어요. 정정 사유를 적어 주세요.";
    return null;
  })();

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await savePlan({
        kind: "curriculum",
        scope: form.scope,
        year,
        semester,
        exam: "",
        parsed: { courses: parsedText.courses },
        note: form.note.trim(),
        file: form.file ?? undefined,
        base: form.file ? undefined : (form.base ?? undefined),
      });
      setMessage({ ok: true, text: `${saved.scope}학년 편제표 ${saved.version}판을 저장했어요.` });
      setForm(blank());
      setNotes([]);
      setReload((n) => n + 1);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function download(row: PlanRow) {
    try {
      const url = await signedUrl(row.file_path, row.file_name);
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

  const groups = GRADES.map((g) => rows.filter((r) => r.scope === g)).filter((v) => v.length > 0);

  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-semibold">
          학년별 편제표 ({year}학년도 {semester}학기)
        </h2>
        <p className="text-sm text-gray-600">
          NEIS의 &apos;학교교육과정 편제 및 시간배당 관리 보고서&apos;(hwp)를 학년마다 올리면, 교과협의록의 과목명 선택지와 성취도 단계(5단계·3단계)가 편제표대로
          자동으로 채워져요. 올린 자료는 지워지지 않고, 정정하면 새 판이 추가돼요.
        </p>
        {!embedded && (
          <p className={`rounded-md p-2 text-sm ${admin ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-700"}`}>
            {admin === null ? "확인하는 중…" : admin ? "관리자로 로그인했어요. 편제표를 올리고 정정할 수 있어요." : "편제표는 관리자만 올릴 수 있어요. 올라온 자료는 볼 수 있고 내려받을 수 있어요."}
          </p>
        )}
        {loadError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{loadError}</p>}

        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">아직 올라온 편제표가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((versions) => (
              <div key={versions[0].scope} className="rounded-md border border-gray-200 p-2 text-sm">
                <p className="font-semibold">{versions[0].scope}학년</p>
                {versions.map((r, i) => (
                  <div key={r.id} className={`flex flex-wrap items-center gap-2 py-1 ${i > 0 ? "text-gray-500" : ""}`}>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold">
                      {r.version}판{i === 0 ? " (현재)" : ""}
                    </span>
                    <span>{r.file_name}</span>
                    <span className="text-xs text-gray-500">{when(r.uploaded_at)}</span>
                    <span className="text-xs">과목 {coursesOf(r).length}개 · {summary(coursesOf(r))}</span>
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
            <p className="font-semibold">{form.base ? `정정: ${form.base.scope}학년 ${form.base.version}판을 바탕으로 새 판 저장` : "새 편제표 올리기"}</p>
            <div className="flex flex-wrap items-center gap-3">
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
              {form.base && (
                <button className="text-gray-500 underline" onClick={() => setForm(blank())}>
                  정정 취소
                </button>
              )}
            </div>
            <DropZone file={form.file} accept=".hwp" hint="hwp · 한 번에 하나" onFiles={receiveFiles} />
            {form.base && !form.file && <p className="text-xs text-gray-500">새 파일을 고르지 않으면 {form.base.file_name} 파일은 그대로 두고 아래 과목만 정정해요.</p>}
            {notes.map((n, i) => (
              <p key={i} className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                {n}
              </p>
            ))}
            <div className="space-y-1">
              <label className="text-xs text-gray-600" htmlFor="curriculum-text">
                파일에서 읽은 과목이에요. 한 줄에 <b>교과, 과목, 성취도 단계, 시수, 학점, 성적처리유형</b>을 탭으로 나눠요. 성취도 단계는 5, 3, -(성취도로 평가하지 않음)이고
                시수부터는 비워도 돼요. 틀린 곳은 고치세요.
              </label>
              <textarea
                id="curriculum-text"
                rows={form.text ? 10 : 3}
                className={`${field} w-full font-mono text-xs`}
                placeholder={"국어\t공통국어2\t5\t64\t4"}
                value={form.text}
                onChange={(e) => set({ text: e.target.value })}
              />
              {parsedText.errors.map((e, i) => (
                <p key={i} className="rounded-md bg-red-50 p-1.5 text-xs text-red-800">
                  {e}
                </p>
              ))}
            </div>
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
        {message && <p className={`rounded-md p-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{message.text}</p>}
      </section>
    </div>
  );
}
