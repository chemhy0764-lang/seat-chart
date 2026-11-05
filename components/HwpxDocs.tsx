"use client";

import { useState } from "react";
import { parseCutoffText } from "@/lib/hwpx/data";
import {
  buildGuide,
  buildMeeting,
  buildMinutes,
  buildNotice,
  valueCountFor,
  type MinutesRow,
  type NoticeKind,
  type Semester,
  type Term,
} from "@/lib/hwpx/docs";
import { loadTemplate, safeName, saveFile } from "@/lib/hwpx/client";
import { latestPlan } from "@/lib/plans/api";
import type { SubjectPlan } from "@/lib/plans/pdf";
import { examValueOf } from "@/lib/plans/subjectsText";
import { AREAS, OTHER as OTHER_AREA, canonicalSubject, subjectsFor } from "@/lib/subjects";

const box = "space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5";
const field = "rounded-md border border-gray-300 px-2 py-1";
const primary = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";

function useRunner() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(label: string, job: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await job();
      setMessage({ ok: true, text: `${label} 파일을 만들었어요. 내려받은 파일을 한글에서 열어 확인하세요.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "파일을 만들지 못했어요." });
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p className={`rounded-md p-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
      {message.text}
    </p>
  );
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dateText(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 ${day}요일 ${hh}시 ${String(mm).padStart(2, "0")}분`;
}

/** 비워 두면 내려받는 날의 날짜를 쓴다(화면을 미리 만들 때 현재 시각을 읽지 않도록 렌더에서는 쓰지 않는다). */
const resolveDate = (date: string) => {
  if (date) return date;
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

// ───────── 분할점수 안내 ─────────

const EMPTY_ROW: MinutesRow = { grade: "", subject: "", writer: "", reviewer: "", exam: "1, 2차", method: "추정분할", levels: "5", average: "" };
/** 화면용 과목 줄: 과목을 '직접 입력'으로 쓰는 줄인지(custom)를 함께 든다. */
type UiRow = MinutesRow & { custom: boolean };
const blankRow = (): UiRow => ({ ...EMPTY_ROW, custom: false });
const ROW_FIELDS: [keyof MinutesRow, string, string][] = [
  ["grade", "학년", "w-20"],
  ["subject", "과목명", "w-28"],
  ["writer", "출제교사", "w-28"],
  ["reviewer", "검토교사", "w-24"],
  ["exam", "정기시험", "w-24"],
  ["method", "산출방식", "w-28"],
  ["levels", "단계", "w-16"],
  ["average", "예상평균", "w-16"],
];

/** 값이 정해져 있는 칸의 선택지. 학교 협의록에 나온 값이다('-'는 해당 없음). */
const CHOICES: Partial<Record<keyof MinutesRow, string[]>> = {
  exam: ["1, 2차", "1차", "2차", "-"],
  method: ["추정분할", "고정분할", "-"],
  levels: ["5", "3"],
};

export function GuideSection({ term }: { term: Term }) {
  const { year, semester } = term;
  const [limit, setLimit] = useState("23.9");
  const guide = useRunner();
  const minutes = useRunner();

  const [areaChoice, setAreaChoice] = useState("");
  const [customArea, setCustomArea] = useState("");
  const area = areaChoice === OTHER_AREA ? customArea : areaChoice;
  const [exam, setExam] = useState<1 | 2>(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("15:30");
  const [place, setPlace] = useState("");
  const [attendees, setAttendees] = useState("");
  const [recorder, setRecorder] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<UiRow[]>([blankRow()]);

  const setRow = (i: number, key: keyof MinutesRow, value: string) =>
    setRows(rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  const subjects = subjectsFor(area);
  const [planNote, setPlanNote] = useState<{ ok: boolean; text: string } | null>(null);
  /** 올린 협의록에서 장소·참석자·기록자를 불러온다. overwrite가 false면 비어 있는 칸만 채운다. */
  async function loadMinutes(name: string, overwrite: boolean) {
    setPlanNote(null);
    try {
      const plan = await latestPlan("minutes", name, year, semester, "", true);
      if (!plan) {
        setPlanNote({ ok: false, text: `${name} 교과로 올라온 협의록이 없어요. '자료 첨부' 탭에서 관리자가 올리면 여기서 불러와요.` });
        return;
      }
      const p = plan.parsed as { place?: string; attendees?: string; recorder?: string; subjects?: SubjectPlan[] };
      if (overwrite || place.trim() === "") setPlace(p.place ?? "");
      if (overwrite || attendees.trim() === "") setAttendees(p.attendees ?? "");
      if (overwrite || recorder.trim() === "") setRecorder(p.recorder ?? "");
      // 과목 줄은 아직 아무것도 채우지 않았을 때(또는 덮어쓰기 버튼) 올린 협의록의 반영 비율 표로 채운다.
      const subs = Array.isArray(p.subjects) ? p.subjects : [];
      const untouched = rows.every((r) => ROW_FIELDS.every(([k]) => r[k].trim() === "" || r[k] === EMPTY_ROW[k]));
      const fillRows = subs.length > 0 && (overwrite || untouched);
      if (fillRows) {
        const hasList = subjectsFor(name).length > 0;
        setRows(
          subs.map((sp) => {
            const c = canonicalSubject(sp.subject, name);
            return { ...EMPTY_ROW, grade: sp.grade, subject: c.name, exam: examValueOf(sp), method: sp.method, custom: hasList && !c.inList };
          }),
        );
      }
      setPlanNote({
        ok: true,
        text: `올린 협의록(${plan.year}학년도 ${plan.semester}학기 ${plan.version}판)에서 장소·참석자·기록자${fillRows ? `와 과목 ${subs.length}개` : ""}를 불러왔어요. 확인하고 필요하면 고쳐 쓰세요.`,
      });
    } catch (e) {
      setPlanNote({ ok: false, text: e instanceof Error ? e.message : "협의록을 불러오지 못했어요." });
    }
  }
  // 교과를 바꾸면 목록에서 고른 과목은 비운다(직접 입력한 과목은 둔다).
  const changeArea = (value: string) => {
    setAreaChoice(value);
    setRows(rows.map((r) => (r.custom ? r : { ...r, subject: "" })));
    if (value && value !== OTHER_AREA) void loadMinutes(value, false);
  };
  const pickSubject = (i: number, value: string) =>
    setRows(rows.map((r, n) => (n === i ? (value === OTHER_AREA ? { ...r, custom: true, subject: "" } : { ...r, custom: false, subject: value }) : r)));

  const guideFile = (kind: "first" | "second") =>
    kind === "first"
      ? `${year}학년도 ${semester}학기 1차 정기시험 및 수행평가 분할점수 산출 안내.hwpx`
      : `${year}학년도 ${semester}학기 2차 정기시험 및 학기말 분할점수 산출 안내.hwpx`;

  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-semibold">분할점수 산출 안내</h2>
        <p className="text-sm text-gray-600">
          1차 정기시험·수행평가와 2차 정기시험·학기말은 절차가 달라서 파일이 둘이에요. 학년도와 학기는 위에서 고른 값
          ({year}학년도 {semester}학기)으로 들어가요.
        </p>
        <label className="flex items-center gap-2 text-sm">
          A 비율 상한(%)
          <input inputMode="decimal" className={`${field} w-20 text-right`} value={limit} onChange={(e) => setLimit(e.target.value)} />
          <span className="text-gray-500">안내문의 &apos;A 비율이 ○○% 보다 높으면 안됨&apos;에 들어가요.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {(["first", "second"] as const).map((kind) => (
            <button
              key={kind}
              className={primary}
              disabled={guide.busy || limit.trim() === ""}
              onClick={() =>
                guide.run(kind === "first" ? "1차 산출 안내" : "2차 산출 안내", async () => {
                  const data = await loadTemplate(kind === "first" ? "guideFirst" : "guideSecond");
                  const bytes = await buildGuide(kind, data, { ...term, aRatioLimit: limit.trim() });
                  saveFile(bytes, guideFile(kind));
                })
              }
            >
              {kind === "first" ? "1차 정기시험·수행평가 안내 내려받기" : "2차 정기시험·학기말 안내 내려받기"}
            </button>
          ))}
        </div>
        <Message message={guide.message} />
        <p className="text-xs text-gray-500">
          2026학년도 안내문을 틀로 만들어요. NEIS 메뉴 이름이나 화면 그림은 틀 그대로라, 해마다 NEIS 화면이 바뀌었는지 확인하세요.
          2차 안내의 틀은 1학기 판이라 2학기를 고르면 글자만 바뀌고 화면 그림은 1학기 것이 들어가요.
        </p>
      </section>

      <section className={box}>
        <h2 className="font-semibold">교과협의록</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <label className="flex items-center gap-2">
            교과
            <select className={`${field} flex-1`} value={areaChoice} onChange={(e) => changeArea(e.target.value)}>
              <option value="">교과를 선택하세요</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value={OTHER_AREA}>{OTHER_AREA}</option>
            </select>
          </label>
          {areaChoice === OTHER_AREA && (
            <label className="flex items-center gap-2">
              교과 이름
              <input className={`${field} flex-1`} placeholder="예: 진로" value={customArea} onChange={(e) => setCustomArea(e.target.value)} />
            </label>
          )}
          <label className="flex items-center gap-2">
            시험
            <select className={field} value={exam} onChange={(e) => setExam(Number(e.target.value) as 1 | 2)}>
              <option value={1}>1차 정기시험</option>
              <option value={2}>2차 정기시험</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            일시
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            장소
            <input className={`${field} flex-1`} value={place} onChange={(e) => setPlace(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            참석자
            <input className={`${field} flex-1`} placeholder="이름을 쉼표로 구분" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            기록자
            <input className={`${field} flex-1`} value={recorder} onChange={(e) => setRecorder(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            건의사항
            <input className={`${field} flex-1`} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-1"
            disabled={areaChoice === "" || areaChoice === OTHER_AREA}
            onClick={() => loadMinutes(areaChoice, true)}
          >
            올린 협의록에서 장소·참석자·기록자·과목 불러오기
          </button>
          <span className="text-xs text-gray-500">교과를 고르면 비어 있는 칸은 자동으로 채워요.</span>
        </div>
        {planNote && (
          <p className={`rounded-md p-2 text-sm ${planNote.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{planNote.text}</p>
        )}

        <div className="space-y-1 overflow-x-auto">
          <p className="text-sm font-semibold">과목별 출제·검토 교사와 분할점수 산출 여부</p>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1 text-sm">
              {ROW_FIELDS.map(([key, label, w]) =>
                CHOICES[key] ? (
                  <select
                    key={key}
                    aria-label={label}
                    className={`${field} ${w}`}
                    value={r[key]}
                    onChange={(e) => setRow(i, key, e.target.value)}
                  >
                    {CHOICES[key]!.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : key === "grade" ? (
                  <select
                    key={key}
                    aria-label={label}
                    className={`${field} ${w}`}
                    value={r.grade}
                    onChange={(e) => setRow(i, "grade", e.target.value)}
                  >
                    <option value="">학년</option>
                    {["1", "2", "3"].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                ) : key === "subject" && subjects.length > 0 ? (
                  <span key={key} className="flex items-center gap-1">
                    <select
                      aria-label={label}
                      className={`${field} w-32`}
                      value={r.custom ? OTHER_AREA : r.subject}
                      onChange={(e) => pickSubject(i, e.target.value)}
                    >
                      <option value="">과목 선택</option>
                      {subjects.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value={OTHER_AREA}>{OTHER_AREA}</option>
                    </select>
                    {r.custom && (
                      <input
                        aria-label="과목명 직접 입력"
                        placeholder="과목명"
                        className={`${field} w-28`}
                        value={r.subject}
                        onChange={(e) => setRow(i, "subject", e.target.value)}
                      />
                    )}
                  </span>
                ) : (
                  <input
                    key={key}
                    aria-label={label}
                    placeholder={label}
                    className={`${field} ${w}`}
                    value={r[key]}
                    onChange={(e) => setRow(i, key, e.target.value)}
                  />
                ),
              )}
              {rows.length > 1 && (
                <button className="text-gray-500 underline" onClick={() => setRows(rows.filter((_, n) => n !== i))}>
                  삭제
                </button>
              )}
            </div>
          ))}
          <button className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm" onClick={() => setRows([...rows, blankRow()])}>
            과목 줄 추가
          </button>
        </div>

        <button
          className={primary}
          disabled={minutes.busy || area.trim() === ""}
          onClick={() =>
            minutes.run("교과협의록", async () => {
              const data = await loadTemplate("minutes");
              const bytes = await buildMinutes(data, {
                ...term,
                subjectArea: area.trim(),
                exam,
                dateText: dateText(resolveDate(date), time),
                place,
                attendees,
                recorder,
                rows: rows
                  .filter((r) => ROW_FIELDS.some(([k]) => r[k].trim() !== "" && r[k] !== EMPTY_ROW[k]))
                  .map((r) => Object.fromEntries(ROW_FIELDS.map(([k]) => [k, r[k]])) as MinutesRow),
                remarks,
              });
              saveFile(bytes, safeName(`${area.trim()}과 회의록(${year}학년도 ${semester}학기 ${exam}차 정기시험).hwpx`));
            })
          }
        >
          교과협의록 내려받기
        </button>
        {area.trim() === "" && <p className="text-xs text-gray-500">교과를 선택하면 내려받을 수 있어요.</p>}
        <Message message={minutes.message} />
        <p className="text-xs text-gray-500">입력한 이름과 내용은 서버에 저장되지 않고, 이 화면에서 파일로만 만들어져요.</p>
      </section>
    </div>
  );
}

// ───────── 분할점수 공지 ─────────

const KINDS: { key: NoticeKind; label: string; hint: string }[] = [
  { key: "first", label: "1차 정기시험", hint: "교과, 값 4개(1학년은 E/I까지 5개)" },
  { key: "perf", label: "수행평가", hint: "교과, 만점, 값 4개(1학년은 E/I까지 5개)" },
  { key: "term", label: "2차 정기시험·학기말", hint: "교과, 2차 값, 학기말 값(2·3학년은 4+4개, 1학년은 5+5개)" },
];

const PLACEHOLDER = (kind: NoticeKind, grade: number) => {
  const n = valueCountFor(kind, grade);
  const lead = kind === "perf" ? "\t52" : "";
  const vals = (base: number) => Array.from({ length: n }, (_, i) => base - i * 15).map((v) => Math.max(v, 0)).join("\t");
  return `추정\n예시교과1${lead}\t${vals(80)}\n고정\n예시교과2${lead}\t${vals(90)}`;
};

type Texts = Record<NoticeKind, Record<1 | 2 | 3, string>>;
const EMPTY_TEXTS: Texts = {
  first: { 1: "", 2: "", 3: "" },
  perf: { 1: "", 2: "", 3: "" },
  term: { 1: "", 2: "", 3: "" },
};

export function NoticeSection({ term }: { term: Term }) {
  const { year, semester } = term;
  const [kind, setKind] = useState<NoticeKind>("first");
  const [texts, setTexts] = useState<Texts>(EMPTY_TEXTS);
  const [date, setDate] = useState("");
  const notice = useRunner();
  const meeting = useRunner();

  const info = KINDS.find((k) => k.key === kind)!;
  const [planNote, setPlanNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  /** 관리자가 올린 학년별 추정분할점수에서 세 학년의 칸을 채운다(이미 쓴 내용은 덮어쓴다). */
  async function loadPlans() {
    setPlanBusy(true);
    setPlanNote(null);
    try {
      const found: string[] = [];
      const missing: string[] = [];
      const next = { ...texts[kind] };
      for (const g of [1, 2, 3] as const) {
        const plan = await latestPlan("cutoffs", String(g), year, semester);
        const text = plan ? String(((plan.parsed as { texts?: Partial<Record<NoticeKind, string>> }).texts ?? {})[kind] ?? "") : "";
        if (plan && text.trim() !== "") {
          next[g] = text;
          found.push(`${g}학년 ${plan.version}판`);
        } else {
          missing.push(`${g}학년`);
        }
      }
      setTexts({ ...texts, [kind]: next });
      setPlanNote({
        ok: found.length > 0,
        text:
          found.length > 0
            ? `${year}학년도 ${semester}학기 ${info.label} 자료를 불러왔어요: ${found.join(", ")}.${missing.length ? ` 올라온 자료가 없는 학년: ${missing.join(", ")}.` : ""}`
            : `${year}학년도 ${semester}학기 ${info.label}로 올라온 추정분할점수 자료가 없어요. '자료 첨부' 탭에서 관리자가 올리면 여기서 불러와요.`,
      });
    } catch (e) {
      setPlanNote({ ok: false, text: e instanceof Error ? e.message : "자료를 불러오지 못했어요." });
    } finally {
      setPlanBusy(false);
    }
  }
  const grades = ([1, 2, 3] as const).map((grade) => {
    const parsed = parseCutoffText(texts[kind][grade], kind === "perf" ? 1 : 0, valueCountFor(kind, grade));
    const empty = texts[kind][grade].trim() === "";
    return { grade, parsed, empty };
  });
  // 수행평가 공지는 3학년 표가 없는 서식이라, 3학년은 비워 두면 '전 과목 고정분할' 안내 문구가 그대로 들어간다.
  const optional = (g: { grade: number }) => kind === "perf" && g.grade === 3;
  const ready = grades.every((g) =>
    optional(g) && g.empty ? true : !g.empty && g.parsed.errors.length === 0 && g.parsed.groups.length > 0,
  );

  const noticeDate = () => {
    const [y, m, d] = resolveDate(date).split("-").map(Number);
    return { year: y, month: m, day: d };
  };
  const gradeData = () => grades.filter((g) => !g.empty).map((g) => ({ grade: g.grade, groups: g.parsed.groups }));

  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-semibold">가정통신문과 학업성적관리회의 자료</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            문서 종류
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value as NoticeKind)}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            공지일
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="text-xs text-gray-500">비우면 내려받는 날</span>
          </label>
        </div>
        <p className="text-sm text-gray-600">
          학년별로 엑셀에서 복사해 붙여넣으세요. 한 줄에 {info.hint}를 쓰고, <b>추정</b> 또는 <b>고정</b>이라고만 쓴 줄로 묶음을
          나눠요. 값이 없는 칸은 - 나 · 를 쓰세요.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="rounded-md border border-gray-300 bg-white px-3 py-1" disabled={planBusy} onClick={loadPlans}>
            올린 추정분할점수 자료에서 불러오기
          </button>
          <span className="text-xs text-gray-500">세 학년 칸을 한 번에 채워요. 불러온 뒤 고쳐 쓸 수 있어요.</span>
        </div>
        {planNote && (
          <p className={`rounded-md p-2 text-sm ${planNote.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{planNote.text}</p>
        )}
        {grades.map(({ grade, parsed, empty }) => (
          <div key={grade} className="space-y-1">
            <label className="text-sm font-semibold" htmlFor={`g${grade}`}>
              {grade}학년{kind === "perf" && grade === 3 ? " (선택: 비우면 '전 과목 고정분할' 안내 문구)" : ""}
            </label>
            <textarea
              id={`g${grade}`}
              rows={6}
              className={`${field} w-full font-mono text-xs`}
              placeholder={PLACEHOLDER(kind, grade)}
              value={texts[kind][grade]}
              onChange={(e) => setTexts({ ...texts, [kind]: { ...texts[kind], [grade]: e.target.value } })}
            />
            {parsed.errors.map((e, i) => (
              <p key={i} className="rounded-md bg-red-50 p-1.5 text-xs text-red-800">
                {e}
              </p>
            ))}
            {!empty && parsed.errors.length === 0 && (
              <p className="text-xs text-gray-500">
                {parsed.groups.map((g) => `${g.kind} ${g.rows.length}과목`).join(", ")}
              </p>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button
            className={primary}
            disabled={!ready || notice.busy}
            onClick={() =>
              notice.run("가정통신문", async () => {
                const data = await loadTemplate(kind === "perf" ? "noticePerf" : kind === "term" ? "noticeTerm" : "noticeWritten");
                const bytes = await buildNotice(data, { ...term, kind, grades: gradeData(), date: noticeDate() });
                saveFile(bytes, safeName(`${year}학년도 ${semester}학기 ${info.label} 분할점수 공지 가정통신문.hwpx`));
              })
            }
          >
            가정통신문 내려받기
          </button>
          <button
            className={primary}
            disabled={!ready || meeting.busy || kind === "perf"}
            onClick={() =>
              meeting.run("학업성적관리회의 자료", async () => {
                if (kind === "perf") return;
                const data = await loadTemplate(kind === "term" ? "noticeTerm" : "noticeWritten");
                const bytes = await buildMeeting(data, { ...term, kind, grades: gradeData(), date: noticeDate() });
                saveFile(bytes, safeName(`${year}학년도 ${semester}학기 학업성적관리회의 자료(${info.label} 분할점수).hwpx`));
              })
            }
          >
            학업성적관리회의 자료 내려받기
          </button>
        </div>
        {kind === "perf" && <p className="text-xs text-gray-500">수행평가는 회의 자료 서식이 없어서 가정통신문만 만들어요.</p>}
        {!ready && (
          <p className="text-xs text-gray-500">
            {kind === "perf" ? "1·2학년을" : "세 학년을 모두"} 올바르게 붙여넣으면 내려받을 수 있어요.
          </p>
        )}
        <Message message={notice.message} />
        <Message message={meeting.message} />
        <p className="text-xs text-gray-500">
          서식은 2026학년도 2학기 가정통신문(1차 정기시험, 수행평가)과 2025학년도 2학기 가정통신문(2차 정기시험·학기말)을 틀로 써요. 학교 이름, 인사말, 참고 내용은 틀 그대로입니다. 학업성적관리회의 자료는 원본이 없어
          가정통신문의 표 서식으로 만들었고, 줄 간격과 글꼴이 학교에서 쓰던 PDF와 조금 다를 수 있어요.
        </p>
      </section>
    </div>
  );
}

export type { Semester };
