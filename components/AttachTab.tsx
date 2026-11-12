"use client";

import { useEffect, useState } from "react";
import DropZone from "@/components/DropZone";
import { parseCutoffText } from "@/lib/hwpx/data";
import { valueCountFor, type NoticeKind, type Term } from "@/lib/hwpx/docs";
import { fetchIsAdmin, latestPlan, listAllPlans, savePlan, signedUrl, type PlanKind, type PlanRow } from "@/lib/plans/api";
import { analyzeUpload } from "@/lib/plans/analyze";
import { coursesToText, parseCoursesText, type Course } from "@/lib/plans/curriculum";
import { EXAM_KINDS, EXAM_LABELS } from "@/lib/plans/exams";
import { tidySubjectNames } from "@/lib/plans/names";
import type { SubjectPlan } from "@/lib/plans/pdf";
import { parseSubjectsText, subjectsToText } from "@/lib/plans/subjectsText";
import { AREAS } from "@/lib/subjects";

const box = "space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5";
const field = "rounded-md border border-gray-300 px-2 py-1";
const primary = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const small = "rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs";

const KINDS: { key: PlanKind; title: string; accept: string; hint: string; help: string }[] = [
  {
    key: "curriculum",
    title: "편제표",
    accept: ".hwp",
    hint: "hwp · 여러 개",
    help: "NEIS '학교교육과정 편제 및 시간배당 관리 보고서'(hwp)를 학년마다 올리세요. 교과협의록의 과목명 선택지와 성취도 단계, 공지의 고정분할 과목에 쓰여요.",
  },
  {
    key: "minutes",
    title: "교과별 협의록",
    accept: ".hwp,.hwpx,.xlsx,.pdf",
    hint: "hwp, hwpx, xlsx, pdf · 여러 개",
    help: "평가계획서 교과별 협의록을 교과마다 올리세요. 장소·참석자·기록자가 교과협의록 자동 채우기에 쓰여요.",
  },
  {
    key: "cutoffs",
    title: "학년별 추정분할점수",
    accept: ".xlsx,.pdf,.hwpx",
    hint: "NEIS 엑셀·pdf · 여러 개",
    help: "NEIS '학기말 추정분할점수 전체교과목' 엑셀이나 PDF를 학년마다 올리세요. 분할점수 공지에서 불러와 쓰여요.",
  },
];
const TITLE: Record<PlanKind, string> = { curriculum: "편제표", minutes: "교과별 협의록", cutoffs: "학년별 추정분할점수" };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function summary(row: PlanRow): string {
  const p = row.parsed as Record<string, unknown>;
  if (row.kind === "curriculum") {
    const courses = Array.isArray(p.courses) ? (p.courses as Course[]) : [];
    const counts = new Map<string, number>();
    for (const c of courses) counts.set(c.area, (counts.get(c.area) ?? 0) + 1);
    return `과목 ${courses.length}개 · ${[...counts].map(([a, n]) => `${a} ${n}`).join(" · ")}`;
  }
  if (row.kind === "minutes") {
    const attendees = typeof p.attendees === "string" && p.attendees ? p.attendees.split(",").length : 0;
    return [p.place && `장소 ${p.place}`, p.recorder && `기록자 ${p.recorder}`, attendees > 0 && `참석자 ${attendees}명`, Array.isArray(p.subjects) && p.subjects.length > 0 && `과목 ${p.subjects.length}개`]
      .filter(Boolean)
      .join(" · ");
  }
  const texts = ((p.texts as Partial<Record<NoticeKind, string>> | undefined) ?? {}) as Partial<Record<NoticeKind, string>>;
  const count = (t?: string) => (t ?? "").split("\n").filter((l) => l.includes("\t")).length;
  return EXAM_KINDS.filter((k) => count(texts[k]) > 0)
    .map((k) => `${EXAM_LABELS[k]} ${count(texts[k])}과목`)
    .join(" · ");
}

const scopeLabel = (kind: PlanKind, scope: string) => (kind === "minutes" ? scope : `${scope}학년`);

/** 자료 첨부 탭: 편제표, 교과별 협의록, 학년별 추정분할점수. 각각 여러 파일을 끌어다 놓으면 읽고 바로 저장한다. */
export default function AttachTab({ term }: { term: Term }) {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [kind, setKind] = useState<PlanKind>("curriculum");
  useEffect(() => {
    let alive = true;
    fetchIsAdmin().then(
      (v) => alive && setAdmin(v),
      () => alive && setAdmin(false),
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-semibold">자료 첨부</h2>
        <p className="text-sm text-gray-600">
          파일을 여러 개 끌어다 놓으면 파일마다 읽어서 바로 저장해요. 저장한 자료는 학년도·학기를 바꿔도 그대로 남아 있고(아래에 모든 학년도·학기의 자료가 보여요), 지워지지 않아요. 고치려면
          &apos;수정&apos;으로 새 판을 만드세요(이전 판은 남아요). 학년도·학기는 파일에서 읽고, 읽지 못하면 위에서 고른 값({term.year}학년도 {term.semester}학기)으로 저장해요.
        </p>
        <p className={`rounded-md p-2 text-sm ${admin ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-700"}`}>
          {admin === null ? "확인하는 중…" : admin ? "관리자로 로그인했어요." : "자료는 관리자만 올릴 수 있어요. 올라온 자료는 볼 수 있고 내려받을 수 있어요."}
        </p>
        <div role="tablist" aria-label="자료 종류" className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-md px-4 py-2 text-sm font-bold ${kind === k.key ? "bg-gray-800 text-white" : "border border-gray-300 bg-white"}`}
            >
              {k.title}
            </button>
          ))}
        </div>
      </section>
      <KindPanel key={kind} kind={kind} term={term} admin={admin === true} />
    </div>
  );
}

type Item = { name: string; state: "wait" | "work" | "saved" | "skipped"; text: string };

function KindPanel({ kind, term, admin }: { kind: PlanKind; term: Term; admin: boolean }) {
  const info = KINDS.find((k) => k.key === kind)!;
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showOld, setShowOld] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    listAllPlans(kind).then(
      (list) => {
        if (!alive) return;
        setRows(list);
        setLoaded(true);
        setLoadError(null);
      },
      (e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : "자료를 불러오지 못했어요.");
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, reload]);

  /** 끌어다 놓은 파일들을 차례로 읽어 저장한다. 같은 교과·학년의 자료가 이미 있으면 새 판으로 저장한다(이전 판은 남는다). */
  async function ingest(files: File[]) {
    if (!admin || busy || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    const list: Item[] = files.map((f) => ({ name: f.name, state: "wait", text: "기다리는 중" }));
    setItems(list);
    const update = (i: number, patch: Partial<Item>) => {
      list[i] = { ...list[i], ...patch };
      setItems([...list]);
    };
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      update(i, { state: "work", text: "읽는 중…" });
      try {
        const a = await analyzeUpload(file.name, await file.arrayBuffer());
        if (!a.ok) {
          update(i, { state: "skipped", text: `저장하지 않았어요. ${a.reason}` });
          continue;
        }
        if (a.kind !== kind) {
          update(i, { state: "skipped", text: `${a.label}(으)로 보여요. '${TITLE[a.kind]}' 탭에서 올려 주세요.` });
          continue;
        }
        const year = a.year ?? term.year;
        const semester = a.semester ?? term.semester;
        const guessed = a.year === null || a.semester === null;
        const previous = await latestPlan(kind, a.scope, year, semester);
        let parsed = a.parsed;
        if (kind === "cutoffs") {
          // PDF에서 벌어진 과목 이름의 띄어쓰기를 편제표(있으면)와 과목 목록의 표기로 바로잡는다.
          const curriculum = await latestPlan("curriculum", a.scope, year, semester);
          const known = ((curriculum?.parsed as { courses?: Course[] } | undefined)?.courses ?? []).map((c) => c.subject);
          const texts = a.parsed.texts as Record<string, string>;
          parsed = { texts: Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, tidySubjectNames(v, known).trim()])) };
        }
        const saved = await savePlan({ kind, scope: a.scope, year, semester, exam: "", parsed, note: previous ? "새 파일로 교체" : "", file });
        update(i, {
          state: "saved",
          text:
            `${a.label} (${year}학년도 ${semester}학기) ${saved.version}판으로 저장했어요.` +
            (previous ? ` 이전 ${previous.version}판은 남아 있어요.` : "") +
            (guessed ? ` 파일에서 학년도·학기를 읽지 못해 위에서 고른 값으로 저장했어요.` : ""),
        });
      } catch (e) {
        update(i, { state: "skipped", text: `저장하지 못했어요. ${e instanceof Error ? e.message : "알 수 없는 오류"}` });
      }
    }
    setBusy(false);
    setReload((n) => n + 1);
  }

  async function saveEdit(row: PlanRow, parsed: Record<string, unknown>, note: string) {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await savePlan({ kind: row.kind, scope: row.scope, year: row.year, semester: row.semester, exam: row.exam, parsed, note: note.trim() || "수정", base: row });
      setMessage({ ok: true, text: `${row.year}학년도 ${row.semester}학기 ${scopeLabel(kind, row.scope)} 자료를 ${saved.version}판으로 저장했어요. 이전 판은 남아 있어요.` });
      setEditing(null);
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

  // 학년도·학기별로 묶고, 그 안에서 같은 교과(학년)의 판을 모은다. rows는 학년도·학기 최신순, 판은 최신이 앞이다.
  const termGroups: { key: string; year: number; semester: number; entries: { key: string; scope: string; versions: PlanRow[] }[] }[] = [];
  for (const r of rows) {
    const tk = `${r.year}-${r.semester}`;
    let g = termGroups.find((x) => x.key === tk);
    if (!g) termGroups.push((g = { key: tk, year: r.year, semester: r.semester, entries: [] }));
    const ek = `${r.scope}|${r.exam}`;
    const e = g.entries.find((x) => x.key === ek);
    if (e) e.versions.push(r);
    else g.entries.push({ key: ek, scope: r.scope, versions: [r] });
  }
  const order = (scope: string) => (kind === "minutes" ? AREAS.findIndex((a) => a === scope) : Number(scope));
  for (const g of termGroups) g.entries.sort((a, b) => order(a.scope) - order(b.scope));

  return (
    <section className={box}>
      <h2 className="font-semibold">{info.title}</h2>
      <p className="text-sm text-gray-600">{info.help}</p>

      {admin && (
        <div className="space-y-2">
          <DropZone file={null} accept={info.accept} hint={info.hint} onFiles={(files) => void ingest(files)} multiple />
          <p className="text-xs text-gray-500">
            끌어다 놓으면 파일마다 읽어서 바로 저장해요. 같은 {kind === "minutes" ? "교과" : "학년"}의 자료가 이미 있으면 새 판으로 저장해요(이전 판은 남아요). 종류나{" "}
            {kind === "minutes" ? "교과" : "학년"}를 알아내지 못한 파일은 저장하지 않고 이유를 알려 줘요.
          </p>
          {items.length > 0 && (
            <div className="space-y-1 text-sm" aria-live="polite">
              <p className="font-semibold">
                {busy ? "저장하는 중…" : `완료: ${items.filter((x) => x.state === "saved").length}개 저장, ${items.filter((x) => x.state === "skipped").length}개는 저장하지 않았어요.`}
              </p>
              <ul className="space-y-1">
                {items.map((x, i) => (
                  <li
                    key={i}
                    className={`rounded-md p-2 text-xs ${x.state === "saved" ? "bg-emerald-50 text-emerald-900" : x.state === "skipped" ? "bg-amber-50 text-amber-900" : "bg-gray-50 text-gray-700"}`}
                  >
                    <b>{x.name}</b> — {x.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {message && <p className={`rounded-md p-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{message.text}</p>}
      {loadError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{loadError}</p>}

      <h3 className="pt-2 text-sm font-semibold">저장된 {info.title}</h3>
      {!loaded && !loadError ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : termGroups.length === 0 ? (
        <p className="text-sm text-gray-500">아직 저장된 자료가 없어요.</p>
      ) : (
        <div className="space-y-3">
          {termGroups.map((g) => (
            <div key={g.key} className="space-y-1">
              <p className={`text-sm font-semibold ${g.year === term.year && g.semester === term.semester ? "text-blue-700" : ""}`}>
                {g.year}학년도 {g.semester}학기{g.year === term.year && g.semester === term.semester ? " (지금 고른 학기)" : ""}
              </p>
              {g.entries.map((e) => {
                const latest = e.versions[0];
                const open = showOld.has(`${g.key}|${e.key}`);
                return (
                  <div key={e.key} className="rounded-md border border-gray-200 p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{scopeLabel(kind, e.scope)}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold">{latest.version}판 (현재)</span>
                      <span>{latest.file_name}</span>
                      <span className="text-xs text-gray-500">{when(latest.uploaded_at)}</span>
                      <span className="text-xs">{summary(latest)}</span>
                      {latest.note && <span className="text-xs text-amber-800">사유: {latest.note}</span>}
                      <button className={small} onClick={() => download(latest)}>
                        내려받기
                      </button>
                      {admin && (
                        <button className={small} onClick={() => setEditing(editing === latest.id ? null : latest.id)}>
                          수정
                        </button>
                      )}
                      {e.versions.length > 1 && (
                        <button
                          className={small}
                          onClick={() => {
                            const next = new Set(showOld);
                            const k = `${g.key}|${e.key}`;
                            if (next.has(k)) next.delete(k);
                            else next.add(k);
                            setShowOld(next);
                          }}
                        >
                          이전 판 {e.versions.length - 1}개 {open ? "숨기기" : "보기"}
                        </button>
                      )}
                    </div>
                    {open &&
                      e.versions.slice(1).map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 py-1 pl-3 text-xs text-gray-500">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{r.version}판</span>
                          <span>{r.file_name}</span>
                          <span>{when(r.uploaded_at)}</span>
                          {r.note && <span className="text-amber-800">사유: {r.note}</span>}
                          <button className={small} onClick={() => download(r)}>
                            내려받기
                          </button>
                        </div>
                      ))}
                    {editing === latest.id && admin && (
                      <Editor row={latest} busy={busy} onCancel={() => setEditing(null)} onSave={(parsed, note) => void saveEdit(latest, parsed, note)} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Editor({ row, busy, onSave, onCancel }: { row: PlanRow; busy: boolean; onSave: (parsed: Record<string, unknown>, note: string) => void; onCancel: () => void }) {
  const p = row.parsed as Record<string, unknown>;
  const [note, setNote] = useState("");
  const [place, setPlace] = useState(String(p.place ?? ""));
  const [attendees, setAttendees] = useState(String(p.attendees ?? ""));
  const [recorder, setRecorder] = useState(String(p.recorder ?? ""));
  const [subjectsText, setSubjectsText] = useState(subjectsToText(Array.isArray(p.subjects) ? (p.subjects as SubjectPlan[]) : []));
  const [coursesText, setCoursesText] = useState(coursesToText(Array.isArray(p.courses) ? (p.courses as Course[]) : []));
  const [texts, setTexts] = useState<Record<NoticeKind, string>>({
    first: "",
    perf: "",
    term: "",
    ...((p.texts as Partial<Record<NoticeKind, string>> | undefined) ?? {}),
  });

  const subjects = row.kind === "minutes" ? parseSubjectsText(subjectsText) : null;
  const courses = row.kind === "curriculum" ? parseCoursesText(coursesText) : null;
  const parsedTexts =
    row.kind === "cutoffs"
      ? (Object.fromEntries(
          EXAM_KINDS.map((k) => [k, texts[k].trim() === "" ? null : parseCutoffText(texts[k], k === "perf" ? 1 : 0, valueCountFor(k, Number(row.scope)))]),
        ) as Record<NoticeKind, ReturnType<typeof parseCutoffText> | null>)
      : null;

  const problem =
    row.kind === "minutes" && subjects && subjects.errors.length > 0
      ? "과목별 반영 비율의 오류를 먼저 고쳐 주세요."
      : row.kind === "curriculum" && courses && (courses.errors.length > 0 || coursesText.trim() === "")
        ? "과목 표의 오류를 먼저 고쳐 주세요."
        : row.kind === "cutoffs" && parsedTexts && EXAM_KINDS.some((k) => (parsedTexts[k]?.errors.length ?? 0) > 0)
          ? "분할점수 표의 오류를 먼저 고쳐 주세요."
          : null;

  function save() {
    if (row.kind === "minutes") onSave({ place: place.trim(), attendees: attendees.trim(), recorder: recorder.trim(), subjects: subjects?.subjects ?? [] }, note);
    else if (row.kind === "curriculum") onSave({ courses: courses?.courses ?? [] }, note);
    else onSave({ texts: Object.fromEntries(EXAM_KINDS.map((k) => [k, texts[k].trim()])) }, note);
  }

  return (
    <div className="mt-2 space-y-2 rounded-md bg-gray-50 p-3">
      <p className="text-sm font-semibold">
        수정: {row.year}학년도 {row.semester}학기 {scopeLabel(row.kind, row.scope)} {row.version}판을 바탕으로 새 판 저장
      </p>
      {row.kind === "minutes" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-1">
            장소
            <input className={`${field} flex-1`} value={place} onChange={(e) => setPlace(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            기록자
            <input className={`${field} flex-1`} value={recorder} onChange={(e) => setRecorder(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 sm:col-span-2">
            참석자
            <input className={`${field} flex-1`} placeholder="이름을 쉼표로 구분" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
          </label>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs text-gray-600">
              과목별 반영 비율: 한 줄에 <b>학년, 과목, 1차, 2차, 수행평가, 산출방식</b>을 탭으로 나눠 써요(실시하지 않으면 -, 산출방식은 추정분할, 고정분할, -).
            </p>
            <textarea rows={6} className={`${field} w-full font-mono text-xs`} value={subjectsText} onChange={(e) => setSubjectsText(e.target.value)} />
            {subjects?.errors.map((e, i) => (
              <p key={i} className="rounded-md bg-red-50 p-1.5 text-xs text-red-800">
                {e}
              </p>
            ))}
          </div>
        </div>
      )}
      {row.kind === "curriculum" && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600">
            한 줄에 <b>교과, 과목, 성취도 단계, 시수, 학점, 성적처리유형</b>을 탭으로 나눠요. 성취도 단계는 5, 3, -(성취도로 평가하지 않음)이고 시수부터는 비워도 돼요.
          </p>
          <textarea rows={10} className={`${field} w-full font-mono text-xs`} value={coursesText} onChange={(e) => setCoursesText(e.target.value)} />
          {courses?.errors.map((e, i) => (
            <p key={i} className="rounded-md bg-red-50 p-1.5 text-xs text-red-800">
              {e}
            </p>
          ))}
        </div>
      )}
      {row.kind === "cutoffs" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">공지 탭에 붙여넣는 것과 같은 형식이에요(<b>추정</b>/<b>고정</b> 줄, 한 줄에 과목과 값). 해당 없는 시험은 비워 두세요.</p>
          {EXAM_KINDS.map((k) => (
            <div key={k} className="space-y-1">
              <label className="text-xs font-semibold" htmlFor={`edit-${row.id}-${k}`}>
                {EXAM_LABELS[k]}
                <span className="ml-1 font-normal text-gray-500">(한 줄에 {k === "perf" ? "과목, 만점, 값" : "과목, 값"} {valueCountFor(k, Number(row.scope))}개)</span>
              </label>
              <textarea
                id={`edit-${row.id}-${k}`}
                rows={texts[k] ? 6 : 2}
                className={`${field} w-full font-mono text-xs`}
                value={texts[k]}
                onChange={(e) => setTexts({ ...texts, [k]: e.target.value })}
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
      <label className="flex items-center gap-1 text-sm">
        수정 사유
        <input className={`${field} flex-1`} placeholder="선택: 무엇을 왜 고쳤는지" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={primary} disabled={busy || problem !== null} onClick={save}>
          새 판으로 저장
        </button>
        <button className="text-sm text-gray-500 underline" onClick={onCancel}>
          취소
        </button>
        {problem && <span className="text-xs text-gray-500">{problem}</span>}
      </div>
    </div>
  );
}
