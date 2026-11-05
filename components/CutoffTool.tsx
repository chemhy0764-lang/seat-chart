"use client";

import { useState } from "react";
import { GuideSection, NoticeSection } from "@/components/HwpxDocs";
import PlanFiles from "@/components/PlanFiles";
import { YEARS, type Semester } from "@/lib/hwpx/docs";
import {
  LEVELS,
  approxSemester,
  checkPerformance,
  checkRates,
  checkSemester,
  checkTeachers,
  rateToScore,
  type Issue,
  type Level,
  type PerfCuts,
  type Rates,
} from "@/lib/cutoff";

type Section = "guide" | "notice" | "plans" | "check";
type Tab = "paper" | "perf" | "term";

const num = (s: string): number | null => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const box = "space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5";
const input = "w-20 rounded-md border border-gray-300 px-2 py-1 text-right";

export default function CutoffTool() {
  const [section, setSection] = useState<Section>("guide");
  const [year, setYear] = useState<number>(YEARS[0]);
  const [semester, setSemester] = useState<Semester>(1);
  const sections: [Section, string][] = [
    ["guide", "분할점수 안내"],
    ["notice", "분할점수 공지"],
    ["plans", "자료 첨부"],
    ["check", "점검 도구"],
  ];
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {sections.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`rounded-md px-4 py-2 text-sm font-bold ${
              section === key ? "bg-blue-600 text-white" : "border border-gray-300 bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {section !== "check" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-black/5">
          <label className="flex items-center gap-2 font-semibold">
            학년도
            <select className="rounded-md border border-gray-300 px-2 py-1" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}학년도
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-semibold">
            학기
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value) as Semester)}
            >
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
            </select>
          </label>
        </div>
      )}
      {section === "guide" && <GuideSection term={{ year, semester }} />}
      {section === "notice" && <NoticeSection term={{ year, semester }} />}
      {section === "plans" && <PlanFiles term={{ year, semester }} />}
      {section === "check" && <CheckTool />}
    </div>
  );
}

function CheckTool() {
  const [tab, setTab] = useState<Tab>("paper");
  const tabs: [Tab, string][] = [
    ["paper", "정기시험 예상정답률"],
    ["perf", "수행평가 분할점수"],
    ["term", "학기말 점검"],
  ];
  return (
    <div className="space-y-4">
      <nav className="flex gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === key ? "bg-gray-800 text-white" : "border border-gray-300 bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "paper" && <PaperTab />}
      {tab === "perf" && <PerfTab />}
      {tab === "term" && <TermTab />}
    </div>
  );
}

function Issues({ issues, okText }: { issues: Issue[]; okText: string }) {
  if (issues.length === 0) {
    return <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">{okText}</p>;
  }
  return (
    <div className="space-y-1">
      {issues.map((i, n) => (
        <p
          key={n}
          className={`rounded-md p-2 text-sm ${
            i.severity === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          {i.severity === "error" ? "오류: " : "확인: "}
          {i.message}
        </p>
      ))}
    </div>
  );
}

function PaperTab() {
  const [teachers, setTeachers] = useState<Record<Level, string>[]>([blank()]);
  const rates: Rates[] = teachers.map((t) => Object.fromEntries(LEVELS.map((l) => [l, num(t[l])])));
  const touched = teachers.some((t) => LEVELS.some((l) => t[l] !== ""));

  return (
    <section className={box}>
      <h2 className="font-semibold">최소능력자 예상정답률(%)</h2>
      <p className="text-sm text-gray-600">
        5% 단위(E는 정수 가능), 5% 이상, 인접 수준 차이 15% 이하(D-E는 19%까지). 공동출제는 교사 칸을 추가하세요.
      </p>
      {teachers.map((t, ti) => (
        <div key={ti} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-14 font-semibold">교사 {ti + 1}</span>
            {LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-1">
                {l}
                <input
                  inputMode="numeric"
                  className={input}
                  value={t[l]}
                  onChange={(e) =>
                    setTeachers(teachers.map((x, i) => (i === ti ? { ...x, [l]: e.target.value } : x)))
                  }
                />
              </label>
            ))}
            {teachers.length > 1 && (
              <button className="text-gray-500 underline" onClick={() => setTeachers(teachers.filter((_, i) => i !== ti))}>
                삭제
              </button>
            )}
          </div>
          {touched && <Issues issues={checkRates(rates[ti])} okText="이 교사의 입력값은 규칙을 지켜요." />}
        </div>
      ))}
      <button
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
        onClick={() => setTeachers([...teachers, blank()])}
      >
        교사 추가
      </button>
      {teachers.length > 1 && touched && (
        <Issues issues={checkTeachers(rates)} okText="교사 사이 차이는 모두 15% 이하예요." />
      )}
    </section>
  );
}

function blank(): Record<Level, string> {
  return { A: "", B: "", C: "", D: "", E: "" };
}

function PerfTab() {
  const [max, setMax] = useState("");
  const [basic, setBasic] = useState("0");
  const [withI, setWithI] = useState(false);
  const [cuts, setCuts] = useState<Record<Level, string>>(blank());
  const [rateStr, setRateStr] = useState<Record<Level, string>>({ A: "90", B: "70", C: "50", D: "40", E: "0" });

  const m = num(max) ?? 0;
  const parsed: PerfCuts = Object.fromEntries(LEVELS.map((l) => [l, num(cuts[l])])) as PerfCuts;
  const levels = withI ? LEVELS : LEVELS.filter((l) => l !== "E");
  const touched = LEVELS.some((l) => cuts[l] !== "");

  function fillFromRates() {
    const next = blank();
    for (const l of levels) {
      const r = num(rateStr[l]);
      if (r !== null) next[l] = String(rateToScore(m, r));
    }
    if (!withI) next.E = "0";
    setCuts(next);
  }

  return (
    <section className={box}>
      <h2 className="font-semibold">수행평가 성취수준별 추정분할점수</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          만점
          <input inputMode="decimal" className={input} value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <label className="flex items-center gap-1">
          수행평가 기본점수
          <input inputMode="decimal" className={input} value={basic} onChange={(e) => setBasic(e.target.value)} />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={withI} onChange={(e) => setWithI(e.target.checked)} />
          E/I(미도달) 단계 교과
        </label>
      </div>
      <p className="text-sm text-gray-600">
        E/I 단계는 2026학년도 2학기 기준 1학년 교과만 해당해요. 안내문에 학년으로 적혀 있고 학기마다 달라질 수 있어요(2026학년도 1학기 PDF 안내는 1·2학년). 해당 학기 안내문을 확인해 체크하세요.
      </p>

      <div className="space-y-1 rounded-md bg-gray-50 p-3 text-sm">
        <p className="font-semibold">성취율로 점수 계산(선택)</p>
        <div className="flex flex-wrap items-center gap-2">
          {levels.map((l) => (
            <label key={l} className="flex items-center gap-1">
              {l}
              <input
                inputMode="numeric"
                className={input}
                value={rateStr[l]}
                onChange={(e) => setRateStr({ ...rateStr, [l]: e.target.value })}
              />
              %
            </label>
          ))}
          <button className="rounded-md bg-gray-800 px-3 py-1 text-white disabled:opacity-40" disabled={m <= 0} onClick={fillFromRates}>
            점수 채우기
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {levels.map((l) => (
          <label key={l} className="flex items-center gap-1">
            {l}
            <input
              inputMode="decimal"
              className={input}
              value={cuts[l]}
              onChange={(e) => setCuts({ ...cuts, [l]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {touched && (
        <Issues
          issues={checkPerformance({ max: m, basic: num(basic) ?? 0, withI, cuts: parsed })}
          okText="수행평가 입력값이 규칙을 지켜요."
        />
      )}
    </section>
  );
}

type PartState = { name: string; weight: string; scale: string; cuts: string[] };

function TermTab() {
  const [parts, setParts] = useState<PartState[]>([
    { name: "1차 정기시험", weight: "", scale: "100", cuts: ["", "", "", "", ""] },
    { name: "2차 정기시험", weight: "", scale: "100", cuts: ["", "", "", "", ""] },
    { name: "수행평가", weight: "", scale: "", cuts: ["", "", "", "", ""] },
  ]);
  const [aCut, setACut] = useState("");
  const [average, setAverage] = useState("");
  const [aRatio, setARatio] = useState("");
  const [limit, setLimit] = useState("23.9");

  const labels = ["A/B", "B/C", "C/D", "D/E", "E/I"];
  const usable = parts.filter((p) => num(p.weight) && num(p.scale));
  const result = usable.length
    ? approxSemester(
        usable.map((p) => ({
          weight: num(p.weight)!,
          scale: num(p.scale)!,
          cuts: p.cuts.map((c) => num(c) ?? 0),
        })),
      )
    : [];
  const weightSum = parts.reduce((s, p) => s + (num(p.weight) ?? 0), 0);

  const [a, avg, ratio, lim] = [num(aCut), num(average), num(aRatio), num(limit)];
  const semIssues =
    a !== null && avg !== null && ratio !== null && lim !== null
      ? checkSemester({ aCut: a, average: avg, aRatio: ratio, aRatioLimit: lim })
      : null;

  function setPart(i: number, patch: Partial<PartState>) {
    setParts(parts.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  }

  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-semibold">학기말 분할점수 근사값</h2>
        <p className="text-sm text-gray-600">
          각 평가의 분할점수 ÷ 만점 × 반영비율을 더해요. 정기시험 만점은 100(NEIS 환산 기준), 수행평가는 수행 만점을 넣으세요.
        </p>
        {parts.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-24 font-semibold">{p.name}</span>
            <label className="flex items-center gap-1">
              반영비율
              <input inputMode="decimal" className={input} value={p.weight} onChange={(e) => setPart(i, { weight: e.target.value })} />
            </label>
            <label className="flex items-center gap-1">
              만점
              <input inputMode="decimal" className={input} value={p.scale} onChange={(e) => setPart(i, { scale: e.target.value })} />
            </label>
            {labels.map((lb, c) => (
              <label key={lb} className="flex items-center gap-1">
                {lb}
                <input
                  inputMode="decimal"
                  className={input}
                  value={p.cuts[c]}
                  onChange={(e) => setPart(i, { cuts: p.cuts.map((x, n) => (n === c ? e.target.value : x)) })}
                />
              </label>
            ))}
          </div>
        ))}
        {usable.length > 0 && weightSum !== 100 && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">반영비율 합이 {weightSum}%예요. 100%인지 확인하세요.</p>
        )}
        {result.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            {result.map((v, i) => (
              <span key={i} className="rounded-md bg-gray-100 px-3 py-1">
                {labels[i]} <b>{v.toFixed(1)}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className={box}>
        <h2 className="font-semibold">학기말 점검</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            A 분할점수
            <input inputMode="decimal" className={input} value={aCut} onChange={(e) => setACut(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            과목 평균
            <input inputMode="decimal" className={input} value={average} onChange={(e) => setAverage(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            A 비율(%)
            <input inputMode="decimal" className={input} value={aRatio} onChange={(e) => setARatio(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            A 비율 상한(%)
            <input inputMode="decimal" className={input} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
        </div>
        <p className="text-sm text-gray-600">
          A 비율 상한은 2026학년도 1~2학기 안내문 기준 23.9%로 채워 두었어요. 안내문마다 달랐어요(2025학년도 2학기 1차 32.8%). 해당 학기 안내문의 값으로 바꿔 쓰세요.
        </p>
        {semIssues && <Issues issues={semIssues} okText="학기말 점검 기준을 지켜요." />}
      </section>
    </div>
  );
}
